// U36 — /api/routing/insights → BFF 프록시 (플라이휠 관찰: tier 분포·승격 후보·승격 이력)
const BFF_URL = process.env.BFF_URL ?? 'http://bff:8000';

export async function GET() {
  try {
    const resp = await fetch(`${BFF_URL}/api/routing/insights`, { cache: 'no-store' });
    const data = await resp.json().catch(() => null);
    return new Response(JSON.stringify(data), {
      status: resp.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    // degrade: 패널이 빈 상태 문구로 폴백
    return new Response('null', { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
}
