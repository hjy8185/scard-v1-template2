'use client';

// U63 P1 — footer 진단 한 줄. 증상 발생 시 이 값으로 원인이 갈린다:
//   mount:2+   → ChatPanel 재마운트(부모가 컴포넌트를 새로 만듦)
//   mount:1 + ⚠ N→0 → 마운트 유지, messages만 초기화
//   sid 변경   → useChat 인스턴스 교체
// 원인 확정 후 제거한다.
import { useEffect, useState } from 'react';
import { diagLine } from '@/lib/chat-diag';

export function ChatDiagLine() {
  const [line, setLine] = useState('');
  useEffect(() => {
    const tick = () => setLine(diagLine());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  if (!line) return null;
  const warn = line.includes('⚠');
  return (
    <span style={{ color: warn ? 'var(--coral)' : 'var(--mist)', fontFamily: 'var(--font-mono)' }}
      data-testid="chat-diag">
      {line}
    </span>
  );
}
