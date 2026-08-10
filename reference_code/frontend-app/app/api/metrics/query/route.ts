// U6 — /api/metrics/query → BFF 프록시 (경로 통일 #5)
const BFF_URL = process.env.BFF_URL ?? 'http://bff:8000';

export async function POST(request: Request) {
  const body = await request.json();
  try {
    const resp = await fetch(`${BFF_URL}/api/metrics/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await resp.json().catch(() => ({ error: 'invalid response' }));
    return new Response(JSON.stringify(data), {
      status: resp.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'metric 서비스 연결 실패' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
