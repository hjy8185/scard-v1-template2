'use client';

// U62 — 메시지 단위 격리 boundary.
//
// 사용자 신고: "말풍선이 잠깐 보였다가 사라져." annotation이 도착하면 그것으로 파생되는
// 위젯이 많다(경로 한 줄·차트·연결 해부·후속 버튼·근거 서랍). 그중 하나가 렌더 중 던지면
// **루트 ErrorBoundary가 화면 전체를 폴백으로 교체**해, 방금 보였던 질문·답변 말풍선까지
// 사라진다. 스트리밍 중에는 잘 보이다가 annotation 도착 시점에 사라지는 증상이 이 구조와
// 맞는다(실측: 답변은 API 200으로 정상 도착).
//
// 여기서 메시지 하나만 격리하면 대화 흐름은 유지되고, 문제 지점을 화면에서 식별할 수 있다.
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { error: Error | null }

export class MessageErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[MessageErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-[var(--r-md)] p-3"
          style={{ border: '1px solid var(--amber)', background: 'var(--ink-700)' }}
          data-testid="message-error">
          <div style={{ fontSize: 'var(--fs-meta)', color: 'var(--amber)' }}>
            이 답변의 화면 구성 중 문제가 생겼습니다 — 대화는 계속할 수 있습니다
          </div>
          <div className="mt-1" style={{ fontSize: 'var(--fs-fine)', color: 'var(--mist)' }}>
            {this.state.error.message.slice(0, 160)}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
