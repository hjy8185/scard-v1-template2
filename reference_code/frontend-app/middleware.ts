import { NextResponse } from 'next/server';

// U6 — 공개 데모(Q5=b): 로그인 인증 제거. 보안 경계(rate limit·CORS·read-only)는 BFF에서.
// middleware는 통과만(향후 IP allowlist 등 추가 지점).
export function middleware() {
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
