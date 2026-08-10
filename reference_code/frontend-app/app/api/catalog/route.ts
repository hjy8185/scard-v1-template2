// U13 — /api/catalog → BFF 프록시 (SMUS 거버넌스 뱃지). 실패는 빈 결과(뱃지 생략 G4).
const BFF_URL = process.env.BFF_URL ?? 'http://bff:8000';

const EMPTY = { assets: [], terms: [], snapshotDate: null };

export async function GET() {
  try {
    const resp = await fetch(`${BFF_URL}/api/catalog`, { cache: 'no-store' });
    const data = await resp.json().catch(() => EMPTY);
    return new Response(JSON.stringify(data), {
      status: resp.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify(EMPTY), {
      status: 200, // degrade: 뱃지만 생략, 지도 정상
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
