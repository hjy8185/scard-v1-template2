// U19 — /api/anatomy → BFF 프록시 (연결 해부 실데이터: 카테고리별 실 혜택행·서울행·서버 검산)
const BFF_URL = process.env.BFF_URL ?? 'http://bff:8000';

export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    const resp = await fetch(`${BFF_URL}/api/anatomy${url.search}`, { cache: 'no-store' });
    const data = await resp.json().catch(() => null);
    return new Response(JSON.stringify(data), {
      status: resp.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    // degrade: 프론트가 정적 풀로 폴백(빈 응답)
    return new Response('null', { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
}
