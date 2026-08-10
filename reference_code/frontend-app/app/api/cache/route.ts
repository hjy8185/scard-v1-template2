// U53 — /api/cache → BFF 프록시 (데모 시나리오 캐시 워밍 버튼).
// GET = 상태 조회(키 수·바이트·hit/miss·진행률), POST = 워밍 시작(백그라운드).
// BFF 다운 시 degrade: null 반환 → 버튼이 "사용 불가"로 표시되고 데모는 계속된다.
const BFF_URL = process.env.BFF_URL ?? 'http://bff:8000';

export async function GET() {
  try {
    const resp = await fetch(`${BFF_URL}/api/cache/status`, { cache: 'no-store' });
    const data = await resp.json().catch(() => null);
    return new Response(JSON.stringify(data), {
      status: resp.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response('null', { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
}

export async function POST() {
  try {
    const resp = await fetch(`${BFF_URL}/api/cache/warm`, {
      method: 'POST',
      cache: 'no-store',
    });
    const data = await resp.json().catch(() => null);
    return new Response(JSON.stringify(data), {
      status: resp.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response('null', { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
}
