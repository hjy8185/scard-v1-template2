import type { Metadata } from 'next';
import { Unbounded, Familjen_Grotesk, IBM_Plex_Sans_KR, JetBrains_Mono } from 'next/font/google';
import { AppProvider } from '@/lib/context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import './globals.css';

// design-system.md §2 — 제네릭(Inter/Roboto) 배격
const display = Unbounded({ subsets: ['latin'], variable: '--font-display', weight: ['400', '600', '800'] });
const body = Familjen_Grotesk({ subsets: ['latin'], variable: '--font-body' });
const plexKr = IBM_Plex_Sans_KR({ subsets: ['latin'], variable: '--font-kr', weight: ['300', '400', '500', '600'] });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'AI-Ready Data Platform · Card Ontology',
  description: '온톨로지·카탈로그·시맨틱 metric·규칙엔진을 엮어 설명가능한 답변을 만드는 데모',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // U61: suppressHydrationWarning — 브라우저 확장(지갑 등)이 <html>/<body>에 속성·노드를
    // 주입하면 서버 HTML과 클라이언트가 불일치해 React가 하이드레이션을 포기할 수 있다.
    // 그러면 클릭·상태 변화가 화면에 반영되지 않아 "질문해도 말풍선조차 안 뜬다"가 된다
    // (사용자 신고 환경: 콘솔에 MetaMask 계열 contentscript 로그 다수, 우리 환경에선 미재현).
    // 이 플래그는 루트 요소의 불일치를 경고로만 처리하고 트리를 버리지 않게 한다.
    <html lang="ko" suppressHydrationWarning>
      <body suppressHydrationWarning
        className={`${display.variable} ${body.variable} ${plexKr.variable} ${mono.variable}`}>
        <ErrorBoundary>
          <AppProvider>{children}</AppProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
