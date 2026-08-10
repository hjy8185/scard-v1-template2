'use client';

// U15 FR-4: 오프닝 — "같은 질문, 온톨로지 없이 vs 있이". 첫 화면 대비 장면.
// before는 실제 v1 답변 형태(사전 캡처, 과장 없음 — system_prompt 규칙7 원문이 지시하던 응답).
// after는 현재(온톨로지 subsumption 직답). 관객이 "온톨로지가 뭘 바꾸나"를 이 장면만으로 이해.
import { useState } from 'react';

// U16: 오프닝 1박자 = 음식점 crosswalk(1:N) — "구조적 부재"(서울 시장 데이터가 v1엔 없음, 누구나 봄).
// U17 FR-4c: 2박자 = 의류/패션 — "같은 데이터인데 말이 달라 못 찾던 것"(subsumption/용어 해석).
const BEATS = [
  {
    question: '우리 음식점 혜택이 노리는 서울 외식 시장, 얼마나 커?',
    tag: '① 없던 데이터를 연결',
    before: {
      label: '온톨로지·외부데이터 없이 (기존)',
      color: 'var(--coral)',
      text: '제공된 카드 정보에는 서울 외식 시장 규모(매출·업종별 통계) 데이터가 포함되어 있지 않습니다. 현재는 카드 혜택 조건·적립률 등 상품 정보에 한정됩니다.',
      note: '카드 데이터만 있어 "시장 규모"를 답할 수 없음 — 외부 통계와 연결이 없음(구조적 부재).',
    },
    after: {
      label: '온톨로지·카탈로그로 (플랫폼)',
      color: 'var(--jade)',
      text: "우리 '음식점' 혜택이 겨냥하는 서울 외식 시장은 약 19.6조원입니다. 약관의 '음식점' 한 단어가 서울 통계의 5개 업종(한식·중식·일식·양식·분식)과 연결됩니다.\n\n🔗 약관어 [음식점] ↔ 서울 통계어 [한식·중식·일식·양식·분식] crosswalk 연결 (커버 90.2%).",
      note: '약관 한 단어 ↔ 통계 5업종을 crosswalk로 이어 시장 규모를 직접 집계.',
    },
  },
  {
    question: '여성 고객 타겟 캠페인, 어떤 업종이 좋아?',
    tag: '② 말이 달라 못 찾던 것',
    before: {
      label: '용어 해석 없이 (기존)',
      color: 'var(--coral)',
      text: '"여성 타겟" "업종"이라는 말과 일치하는 데이터 컬럼이 없어 답변할 수 없습니다. 성별·업종별 매출 테이블명을 직접 지정해 주세요.',
      note: '데이터는 있었지만 현업의 말(여성 타겟)과 데이터의 말(성별×업종 매출)이 달라 못 찾음.',
    },
    after: {
      label: '온톨로지·카탈로그로 (플랫폼)',
      color: 'var(--jade)',
      text: '의류/패션이 좋습니다 — 서울 의류 소비는 여성 4,736억 vs 남성 2,778억(여성 63%)으로 편차가 가장 큽니다. 의류/패션 혜택 카드와 바로 이을 수 있어요.\n\n🔗 현업어 [여성 타겟 업종] → 통계 [성별×업종 매출] → 약관어 [의류/패션 혜택] 자동 해석.',
      note: '카탈로그·온톨로지가 현업의 말을 데이터의 말로 번역 — 같은 데이터가 답이 됨.',
    },
  },
];

export function OpeningComparison() {
  const [open, setOpen] = useState(true);
  const [beatIdx, setBeatIdx] = useState(0);
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-[13px] rounded-[var(--r-pill)] px-3 py-1"
        style={{ background: 'var(--ink-700)', color: 'var(--mist)' }}
        data-testid="opening-comparison">
        ◐ 오프닝: 온톨로지 없이 vs 있이 다시 보기
      </button>
    );
  }
  const beat = BEATS[beatIdx];
  return (
    <div className="rounded-[var(--r-lg)] p-3" style={{ background: 'var(--ink-800)', border: '1px solid var(--ink-600)' }}
      data-testid="opening-comparison">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium" style={{ color: 'var(--pearl)' }}>
          같은 질문, 온톨로지 없이 vs 있이
        </span>
        <div className="flex items-center gap-2">
          {BEATS.map((b, i) => (
            <button key={i} onClick={() => setBeatIdx(i)}
              className="rounded-[var(--r-pill)] px-2 py-0.5 text-[13px]"
              style={{
                background: i === beatIdx ? 'var(--flow)' : 'var(--ink-700)',
                color: i === beatIdx ? '#06121a' : 'var(--mist)',
              }}>
              {b.tag}
            </button>
          ))}
          <button onClick={() => setOpen(false)} aria-label="닫기" style={{ color: 'var(--mist)' }}>✕</button>
        </div>
      </div>
      <div className="mb-2 text-[13px] rounded-[var(--r-md)] px-2.5 py-1.5"
        style={{ background: 'var(--ink-700)', color: 'var(--pearl)' }}>
        Q. {beat.question}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[beat.before, beat.after].map((c, i) => (
          <div key={i} className="rounded-[var(--r-md)] p-2.5"
            style={{ background: 'var(--ink-900)', border: `1px solid ${c.color}` }}>
            <div className="text-[13px] font-medium mb-1" style={{ color: c.color }}>{c.label}</div>
            <div className="text-[13px] whitespace-pre-wrap mb-1.5" style={{ color: 'var(--pearl)' }}>{c.text}</div>
            <div className="text-[13px]" style={{ color: 'var(--mist)' }}>{c.note}</div>
          </div>
        ))}
      </div>
      <div className="mt-2 text-[13px]" style={{ color: 'var(--mist)' }}>
        💡 데이터는 원래 있었고, <span style={{ color: 'var(--jade)' }}>연결(온톨로지·카탈로그)이 답을 만듭니다</span>.
      </div>
    </div>
  );
}
