'use client';

// U13 P4-1 + U14 P2-1: driver.js 온보딩. "명사와 동사" 개념 3장(스토리텔링) → 화면 안내.
import { useEffect } from 'react';


interface TourControllerProps {
  trigger: number | boolean; // U38: 가이드 버튼 클릭 nonce(0=미실행)
}

// U38 P0-1: 자동 실행 제거 — 첫 답변 직후 오버레이가 근거 버튼 클릭을 차단하던 결함.
// trigger는 이제 '가이드 버튼 클릭 nonce'(0이면 미실행). SEEN_KEY 게이트도 제거(명시 실행).
export function TourController({ trigger }: TourControllerProps) {
  useEffect(() => {
    if (!trigger) return;
    if (typeof window === 'undefined') return;

    let cancelled = false;
    // 동적 import: 번들 분리 + reduced-motion 존중
    import('driver.js').then(({ driver }) => {
      if (cancelled) return;
      // @ts-expect-error side-effect css import (no types)
      import('driver.js/dist/driver.css').catch(() => {});
      const d = driver({
        showProgress: true,
        steps: [
          // U14 P2: "명사와 동사" 스토리텔링 3장 (Palantir 온톨로지 소개 방식)
          { popover: {
            title: '① 카드사의 명사와 동사', description: '카드·혜택·가맹점이 명사, "적립된다·제외된다·실적을 채운다"가 동사입니다. 이 명사와 동사를 기계가 이해하게 만든 것이 온톨로지예요.' } },
          { popover: {
            title: '② 흩어진 3개 언어', description: '약관어(신한 카테고리)·통계어(서울 업종)·지표어(실질혜택률)가 서로 다른 말로 흩어져 있습니다. 그대로면 AI가 못 잇죠.' } },
          { popover: {
            title: '③ 온톨로지 연결(crosswalk)이 잇는다', description: '약관의 "음식점" 한 단어를 서울 통계의 5개 업종(한식·중식·일식·양식·분식)과 매핑해두면, 한 질문으로 카드 혜택과 시장 데이터가 연결됩니다.' } },
          { element: '[data-tour="asset-map"]', popover: {
            title: '데이터 자산 지도', description: '여기 3개 진영(약관·시장·거래)과 이들을 잇는 온톨로지 연결이 항상 보입니다. 무슨 데이터가 있는지 한눈에.' } },
          { element: '[data-tour="asset-map"]', popover: {
            title: '답변이 쓴 자산 점등', description: '질문하면 이 답이 실제로 사용한 데이터와 연결만 켜지고 나머지는 흐려집니다. 무엇을 썼는지 보이죠.' } },
          { element: '[data-tour="chat"]', popover: {
            title: '과정과 근거', description: '답변 아래 "과정"을 펼치면 어떤 도구로 어떻게 답했는지, 등급색으로 얼마나 믿을 수 있는지 확인할 수 있습니다.' } },
        ],
      });
      d.drive();
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [trigger]);

  return null;
}
