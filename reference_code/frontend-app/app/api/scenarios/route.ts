// U6 — /api/scenarios → BFF 프록시 (6 카테고리×5 계약)
const BFF_URL = process.env.BFF_URL ?? 'http://bff:8000';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const qs = url.search; // group=, category= 전달
  try {
    const resp = await fetch(`${BFF_URL}/api/scenarios${qs}`, { cache: 'no-store' });
    const data = await resp.json().catch(() => ({ categories: [] }));
    return new Response(JSON.stringify(data), {
      status: resp.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ categories: [], error: 'scenarios 연결 실패' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
