import type { Metadata } from 'next';
import { AppProvider } from '@/lib/context';
import './globals.css';

export const metadata: Metadata = {
  title: 'Onedata AI Agent - 신한금융그룹',
  description: 'AI 기반 데이터 조회 에이전트 - Onedata 플랫폼',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
