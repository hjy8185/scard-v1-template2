const BFF_URL = process.env.BFF_URL ?? 'http://localhost:8000';

// SSE streaming headers - prevent proxy buffering
const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  'X-Accel-Buffering': 'no',
  Connection: 'keep-alive',
} as const;

export async function POST(request: Request) {
  const body = await request.json();
  const { query } = body;

  if (!query || typeof query !== 'string' || !query.trim()) {
    return new Response(
      JSON.stringify({ event_type: 'error', status: 'error', data: { message: '질문을 입력해주세요.' } }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  let backendResponse: Response;
  try {
    backendResponse = await fetch(`${BFF_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: query.trim() }),
    });
  } catch (err) {
    // Backend unreachable - return error as SSE event
    const encoder = new TextEncoder();
    const errorStream = new ReadableStream({
      start(controller) {
        const errorEvent = JSON.stringify({
          event_type: 'error',
          status: 'error',
          data: { message: '백엔드 서비스에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.' },
        });
        controller.enqueue(encoder.encode(`data: ${errorEvent}\n\n`));
        controller.close();
      },
    });
    return new Response(errorStream, { headers: SSE_HEADERS });
  }

  if (!backendResponse.ok) {
    const errorText = await backendResponse.text().catch(() => '알 수 없는 오류');
    const encoder = new TextEncoder();
    const errorStream = new ReadableStream({
      start(controller) {
        const errorEvent = JSON.stringify({
          event_type: 'error',
          status: 'error',
          data: { message: `백엔드 오류 (${backendResponse.status}): ${errorText.slice(0, 200)}` },
        });
        controller.enqueue(encoder.encode(`data: ${errorEvent}\n\n`));
        controller.close();
      },
    });
    return new Response(errorStream, { headers: SSE_HEADERS });
  }

  if (!backendResponse.body) {
    return new Response(null, { status: 204 });
  }

  // Stream the backend response directly to the client
  return new Response(backendResponse.body, { headers: SSE_HEADERS });
}
