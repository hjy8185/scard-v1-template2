// U38 — UI v2 feature flag (U42+: 비활성화).
// v2 shell은 URL(?ui=v2)·localStorage 어느 경로로도 진입 불가하게 막았다.
// 크롬이 localStorage에 박아둔 'cg-ui-version=v2'가 URL 파라미터를 빼도 계속 v2를
// 띄우던 문제(캐싱처럼 보임) → 항상 false 반환 + 저장값 청소로 v1 복귀 보장.
'use client';

const KEY = 'cg-ui-version';

export function useUiV2(): boolean {
  // v2 진입 전면 차단. 과거에 저장된 플래그가 남아 있으면 청소(v1 강제 복귀).
  if (typeof window !== 'undefined') {
    try {
      if (localStorage.getItem(KEY) !== null) localStorage.removeItem(KEY);
    } catch {
      /* localStorage 접근 불가(사생활 모드 등) — 무시 */
    }
  }
  return false;
}
