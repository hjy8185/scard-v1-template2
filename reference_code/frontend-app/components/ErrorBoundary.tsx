'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
    // U62: 폴백 진입을 화면에서도 식별 가능하게(발표 중 "갑자기 사라졌다"의 정체 규명용).
    // 콘솔만 남기면 사용자는 원인을 알 수 없다 — 실제로 이 증상 진단이 여러 차례 헛돌았다.
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-boundary-error', error.message.slice(0, 120));
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen items-center justify-center"
          style={{ background: 'var(--ink-900)', color: 'var(--pearl)' }}
          data-testid="boundary-fallback">
          <div className="max-w-md space-y-4 rounded-[var(--r-md)] p-6 text-center"
            style={{ border: '1px solid var(--coral)', background: 'var(--ink-800)' }}>
            <h2 className="text-lg font-semibold" style={{ color: 'var(--coral)' }}>
              화면 렌더링 오류
            </h2>
            <p className="text-sm text-muted-foreground">
              {this.state.error?.message ?? '예기치 않은 오류가 발생했습니다.'}
            </p>
            <button
              className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              다시 시도
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
