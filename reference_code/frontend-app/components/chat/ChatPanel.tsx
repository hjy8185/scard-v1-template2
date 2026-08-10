'use client';

import React, { useEffect, useRef, useCallback } from 'react';
import { useChat } from '@ai-sdk/react';
import { OpeningComparison } from '@/components/controls/OpeningComparison';
import { MessageErrorBoundary } from '@/components/chat/MessageErrorBoundary';
import { recordLen, recordMount } from '@/lib/chat-diag';
import { useAppContext } from '@/lib/context';
import { ChatInput } from './ChatInput';
import { ChatMessage } from './ChatMessage';
import type { MessageAnnotation, PlatformAnnotation, PlatformStageEvent, ReasoningTrace } from '@/lib/types';
import { dominantGrade } from '@/lib/provenance';
import { computeLighting } from '@/lib/asset-map';

export function ChatPanel() {
  const {
    setAnnotation,
    setDominant,
    setLighting,
    reasoningTrace,
    setReasoningTrace,
    setDrilldownSelection,
    setCiteFocus,
    pendingQuery,
    setPendingQuery,
    pendingCardId,
    narration,
  } = useAppContext();

  // U63 P3: **고정 id 필수**. id가 없으면 useChat이 마운트마다 새 인스턴스를 만들고
  // messages가 초기화된다. 실측(확정 원인): 페이지 로드 직후(하이드레이션 완료 전)에
  // 입력·키 이벤트가 들어오면 React가 ChatPanel을 **두 번 마운트**하고(계측 mount:2),
  // 그때 방금 보였던 질문·답변 말풍선이 사라진다(사용자 신고 "잠깐 보였다 사라져").
  // 고정 id는 SWR 캐시 키가 되어 재마운트 시 이전 messages를 복원한다.
  const { messages, append, setMessages, data, isLoading, error } = useChat({
    api: '/api/chat',
    id: 'cg-chat',
  });

  // U63 P1: 채팅 소실 진단 — 마운트 횟수·인스턴스 id·messages 길이 감소를 기록한다.
  // 예외 없이 사라지는 증상의 원인(재마운트 / 상태 초기화 / 인스턴스 교체)을 값으로 구분.
  const sidRef = useRef<string>('');
  if (sidRef.current === '') sidRef.current = recordMount();
  useEffect(() => { recordLen(messages.length, sidRef.current); }, [messages.length]);

  const appendRef = useRef(append);
  appendRef.current = append;
  const scrollRef = useRef<HTMLDivElement>(null);
  const streamSigRef = useRef<string | null>(null);   // U43(#185): streaming trace 중복쓰기 차단

  // Scenario auto-send — pendingQuery(U17: v1 SCENARIOS fallback 제거 — 도달 불가 코드였음)
  useEffect(() => {
    if (!pendingQuery) return;
    setCiteFocus(null);   // 새 시나리오 질의 → 이전 cite pill 포커스 해제
    setReasoningTrace(undefined);
    appendRef.current(
      { role: 'user', content: pendingQuery },
      pendingCardId ? { body: { preset_card_id: pendingCardId } } : undefined,
    );
    setPendingQuery(undefined);
  }, [pendingQuery, pendingCardId, setPendingQuery, setCiteFocus, setReasoningTrace]);

  // U17 FR-5a: 스트리밍 stage 이벤트 → 생성 중 과정 표시(reasoningTrace streaming phase).
  // (구 platformStages/pipelineStages 배선은 구독자가 없어 제거 — FR-5b)
  useEffect(() => {
    if (!data || !Array.isArray(data)) return;
    const events: PlatformStageEvent[] = [];
    for (const item of data) {
      if (item && typeof item === 'object' && 'event_type' in (item as object)) {
        events.push(item as unknown as PlatformStageEvent);
      }
    }
    if (!events.length) return;
    // 최신 질의 = 마지막 route(active) 이후
    let start = -1;
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].event_type === 'route' && events[i].status === 'active') { start = i; break; }
    }
    const cur = start >= 0 ? events.slice(start) : events;
    const toolSteps = cur
      .filter((e) => e.event_type === 'tool')
      .map((e) => ({
        tool: e.tool ?? 'tool',
        templateId: (e.payload?.template_id as string) ?? undefined,
        status: e.status,
      }));
    // U43(#185): 내용이 같으면 새 객체를 쓰지 않는다. 매 data tick마다 새 참조를 context에
    // 넣으면 전 구독자 리렌더 → effect 재발동의 왕복이 생긴다(스트리밍 중 특히 고빈도).
    const sig = toolSteps.map((s) => `${s.tool}|${s.templateId ?? ''}|${s.status}`).join(',');
    if (sig === streamSigRef.current) return;
    streamSigRef.current = sig;
    setReasoningTrace({ phase: 'streaming', toolSteps });
  }, [data, setReasoningTrace]);

  // Extract annotation (U6 PlatformAnnotation) from last assistant message.
  //
  // U43(#185 근본 수리): 이 effect는 messages가 tick될 때마다 computeLighting()으로
  // '매번 새 객체'를 context에 써왔다. setLighting은 참조가 다르면 항상 상태 변경으로
  // 취급되므로 → AppProvider 리렌더 → 구독자(ChatPanel 포함) 리렌더 → messages 참조가
  // 조금이라도 흔들리면 effect 재발동 → 다시 새 객체 → Maximum update depth(#185).
  // context.tsx의 citeFocus 주석이 경고한 그 루프가 ChatPanel 자신에게 남아 있었다.
  // 해법: '이미 반영한 annotation'을 ref로 기억하고, 동일 답변이면 어떤 setState도 하지 않는다.
  const appliedAnnRef = useRef<PlatformAnnotation | undefined>(undefined);
  useEffect(() => {
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
    const ann = lastAssistant?.annotations?.[0] as PlatformAnnotation | undefined;
    if (!ann) return;
    if (appliedAnnRef.current === ann) return;   // 같은 답변 재방문 → 쓰기 금지(루프 차단)
    appliedAnnRef.current = ann;

    setAnnotation(ann);
    if (ann.citation?.provenance) setDominant(dominantGrade(ann.citation.provenance));
    // U13 점등(Q2): tool_calls + intent 기반
    const toolCalls = (ann.tool_calls ?? []) as Array<Record<string, unknown>>;
    const toolNames = toolCalls.map((t) => String(t.tool ?? ''));
    setLighting(computeLighting(ann, toolNames));
    // 스트리밍 종료 → streaming trace 해제(완료 trace는 AnswerShell이 annotation에서 직접 빌드)
    setReasoningTrace(undefined);
    // 이전 답변의 드릴다운은 닫아 새 답변 뷰가 깔끔히 보이게.
    setDrilldownSelection(null);
  }, [messages, setAnnotation, setDominant, setLighting, setReasoningTrace, setDrilldownSelection]);

  // U40 스크롤 상태기계(P0-7): 스트리밍 중=auto-follow(바닥 근처일 때만),
  // 사용자 개입 시 중단, 완료 시(개입 없으면) 마지막 assistant 시작으로.
  const autoFollowRef = useRef(true);          // 바닥 근처 → 스트리밍 추적
  const userIntervenedRef = useRef(false);     // 이번 응답 중 사용자 스크롤 개입
  const programmaticRef = useRef(false);       // 프로그램 스크롤 오판 방지
  const wasLoadingRef = useRef(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onUserScroll = () => {
      if (programmaticRef.current) return;
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      autoFollowRef.current = nearBottom;
      if (!nearBottom) userIntervenedRef.current = true;
    };
    el.addEventListener('wheel', onUserScroll, { passive: true });
    el.addEventListener('touchmove', onUserScroll, { passive: true });
    el.addEventListener('scroll', onUserScroll, { passive: true });
    return () => {
      el.removeEventListener('wheel', onUserScroll);
      el.removeEventListener('touchmove', onUserScroll);
      el.removeEventListener('scroll', onUserScroll);
    };
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const justCompleted = wasLoadingRef.current && !isLoading;
    wasLoadingRef.current = isLoading;

    if (isLoading) {
      if (messages[messages.length - 1]?.role === 'user') {
        // 새 질문 전송 — 개입 플래그 리셋 + follow 시작
        userIntervenedRef.current = false;
        autoFollowRef.current = true;
      }
      if (autoFollowRef.current && !userIntervenedRef.current) {
        programmaticRef.current = true;
        el.scrollTo({ top: el.scrollHeight });
        requestAnimationFrame(() => { programmaticRef.current = false; });
      }
      return;
    }
    if (justCompleted && !userIntervenedRef.current) {
      // 완료: 마지막 assistant 메시지 시작으로(두괄식 답이 화면 최상단에)
      const anchors = el.querySelectorAll('[data-role="assistant"]');
      const last = anchors[anchors.length - 1] as HTMLElement | undefined;
      if (last) {
        // 짧은 답변(전체가 이미 보임)이면 재이동 없음
        const cRect = el.getBoundingClientRect();
        const aRect = last.getBoundingClientRect();
        const fullyVisible = aRect.top >= cRect.top && aRect.bottom <= cRect.bottom;
        if (!fullyVisible) {
          programmaticRef.current = true;
          last.scrollIntoView({ block: 'start', behavior: 'auto' });
          requestAnimationFrame(() => { programmaticRef.current = false; });
        }
      }
    }
  }, [messages, isLoading]);

  const handleSend = useCallback(
    (content: string) => {
      setCiteFocus(null);   // 새 질문 → 이전 cite pill 포커스 해제(view가 overview에 갇히지 않게)
      setReasoningTrace(undefined);
      append({ role: 'user', content });
    },
    [append, setCiteFocus, setReasoningTrace],
  );

  // U17 §3: "다음은?" 제안 버튼 클릭 → 즉시 질문 전송(여정이 클릭만으로 이어짐)
  const handleSuggestion = useCallback((query: string) => {
    if (isLoading) return;
    handleSend(query);
  }, [handleSend, isLoading]);

  const streamingTools = reasoningTrace?.phase === 'streaming' ? reasoningTrace.toolSteps : [];

  return (
    <div className="flex h-full flex-col">
      {/* U57: 대화를 **아래로 붙인다**(justify-end). 상단 정렬이면 답변 전 좌측 패널
          90%가 빈 검정 바탕으로 남아 "맨바탕에 말풍선만" 보인다(사용자 신고 — 캡처로
          확인). 채팅 관례대로 입력창 근처에 쌓이면 빈 영역이 위로 가고 시선이 모인다. */}
      {/* U63d: `justify-end`를 쓰면 안 된다. flex 컨테이너에서 내용이 넘칠 때 **위로 넘친
          부분에 스크롤이 닿지 않는다**(scrollTop 0이 이미 잘린 위치 — flexbox 알려진 동작).
          답변이 길면 윗부분을 다시 볼 수 없다(사용자 신고). 아래 정렬(U57 의도)은
          내부 래퍼의 `mt-auto`로 얻는다 — 이건 스크롤 영역을 잘라먹지 않는다. */}
      <div ref={scrollRef}
        className="flex flex-1 min-h-0 flex-col gap-3 overflow-y-auto p-4">
        {/* U56: 오프닝 대비 장면은 **대화 시작 전에만**. page.tsx에서 `!annotation`으로
            걸었더니 annotation이 스트림 맨 끝에 오기 때문에 질문 후 14초간 남아 화면
            절반을 차지하고, 사용자 질문·로딩 표시를 아래로 밀어냈다(신고: "말풍선까지
            통째로 사라졌다"). messages를 아는 ChatPanel이 렌더해야 질문 즉시 사라진다. */}
        {/* U63d: 아래 정렬용 스페이서. 내용이 짧으면 남는 공간을 위로 밀어 대화가 입력창
            근처에 쌓이고(U57 의도), 내용이 길면 높이 0이 되어 스크롤을 방해하지 않는다. */}
        <div className="mt-auto" aria-hidden data-testid="chat-bottom-spacer" />
        {messages.length === 0 && !isLoading && !narration && !pendingQuery && (
          <OpeningComparison />
        )}
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-sm" style={{ color: 'var(--mist)' }}>
            카드 혜택, 연회비, 실적 조건 등을 질문해보세요.
          </div>
        )}
        {/* U55: 내용이 빈 assistant 메시지는 렌더하지 않는다.
            useChat이 응답 시작과 함께 빈 assistant 메시지를 만들어두는데, 그것을 그리면
            첫 토큰까지(실측 ~6초) **맨바탕에 빈 말풍선만** 보이고 로딩 인디케이터는 그
            아래로 밀려 안 보인다(사용자 신고: "... 표시도 없고 말풍선만 뜨고 멈춰").
            빈 것을 건너뛰면 그 구간은 인디케이터('응답 생성 중' + tool 뱃지)가 차지한다. */}
        {messages.filter((m) => m.role !== 'assistant' || (m.content ?? '').trim().length > 0)
          .map((msg) => (
          /* U62: 메시지별 격리 boundary — 사용자 신고 "말풍선이 잠깐 보였다가 사라져".
             annotation 파생 위젯(차트·해부·경로줄·후속 버튼)이 던지면 루트 boundary가
             **대화 전체**를 폴백으로 바꿔 방금 보였던 말풍선이 사라진다. 메시지 단위로
             격리하면 문제 있는 한 건만 안내로 대체되고 나머지 대화는 유지된다. */
          <MessageErrorBoundary key={msg.id}>
            <ChatMessage
              messageId={msg.id}
              role={msg.role as 'user' | 'assistant'}
              content={msg.content}
              annotation={
                msg.role === 'assistant' && msg.annotations
                  ? (msg.annotations[0] as MessageAnnotation)
                  : undefined
              }
              onSuggestion={handleSuggestion}
            />
          </MessageErrorBoundary>
        ))}
        {/* U61: 에러 사유를 감추지 않는다. "오류가 발생했습니다"만 띄우면 발표 중에
            원인을 알 수 없다(이번 신고 진단이 길어진 이유). 브라우저 확장이 fetch/스트림을
            가로채는 경우가 실제로 있으므로 그 안내도 함께 준다. */}
        {error && (
          <div className="rounded-[var(--r-md)] p-3 text-sm"
            style={{ border: '1px solid var(--coral)', background: 'var(--ink-700)',
                     color: 'var(--pearl)' }}
            data-testid="chat-error">
            <div style={{ color: 'var(--coral)', fontWeight: 600 }}>답변을 받지 못했습니다</div>
            <div className="mt-1" style={{ fontSize: 'var(--fs-fine)', color: 'var(--mist)' }}>
              {String((error as Error)?.message ?? error).slice(0, 200)}
            </div>
            <div className="mt-1.5" style={{ fontSize: 'var(--fs-fine)', color: 'var(--mist)' }}>
              브라우저 확장(지갑 등)이 요청을 가로채면 이 화면이 나올 수 있습니다 —
              시크릿 창에서 다시 시도해 보세요.
            </div>
          </div>
        )}
        {isLoading && (
          <div className="flex justify-start">
            {/* U57: 존재감 강화 — 점 3개만으로는 빈 화면에서 "멈춘 것"처럼 보였다.
                테두리·강조색과 진행 문구로 "지금 일하고 있다"를 읽히게. */}
            <div className="rounded-[var(--r-md)] px-4 py-3 text-sm"
              style={{ background: 'var(--ink-700)', color: 'var(--pearl)',
                       border: '1px solid var(--flow-solid)',
                       boxShadow: '0 0 14px rgba(56,199,224,.25)', minWidth: 240 }}>
              <span className="inline-flex items-center gap-1">
                <span className="animate-pulse">●</span>
                <span className="animate-pulse" style={{ animationDelay: '0.2s' }}>●</span>
                <span className="animate-pulse" style={{ animationDelay: '0.4s' }}>●</span>
                <span className="ml-2 text-[13px]" style={{ color: 'var(--flow-solid)' }}>
                  근거 데이터를 모으고 답변을 만들고 있습니다…
                </span>
              </span>
              {/* U17 FR-5a: 생성 중 과정 표시 — 침묵 공백 제거 */}
              {streamingTools.length > 0 && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1" data-testid="streaming-trace">
                  {streamingTools.map((s, i) => (
                    <span key={i} className="rounded-[var(--r-pill)] px-2 py-0.5 text-[13px]"
                      style={{
                        background: 'var(--ink-800)',
                        color: s.status === 'done' ? 'var(--jade)' : 'var(--aqua)',
                        border: '1px solid var(--ink-600)',
                      }}>
                      {s.status === 'done' ? '✓ ' : '… '}{s.tool}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="shrink-0">
        <ChatInput onSend={handleSend} isLoading={isLoading} />
      </div>
    </div>
  );
}
