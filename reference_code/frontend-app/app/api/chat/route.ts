const BFF_URL = process.env.BFF_URL ?? 'http://bff:8000';

// SSE 스트림 공통 헤더 — 프록시(CloudFront/ALB) 버퍼링·변형 방지.
// no-transform: CloudFront가 응답을 재인코딩(HTTP2 프레이밍 깨짐→ERR_HTTP2_PROTOCOL_ERROR)하지 않게.
// X-Accel-Buffering:no: nginx/프록시 버퍼링 끔(스트림 즉시 flush).
const SSE_HEADERS = {
  'Content-Type': 'text/plain; charset=utf-8',
  'x-vercel-ai-data-stream': 'v1',
  'Cache-Control': 'no-cache, no-transform',
  'X-Accel-Buffering': 'no',
  Connection: 'keep-alive',
} as const;

export async function POST(request: Request) {
  const body = await request.json();
  const { messages, preset_card_id } = body;

  const lastUserMessage = [...messages].reverse().find(
    (m: { role: string }) => m.role === 'user',
  );

  if (!lastUserMessage) {
    const encoder = new TextEncoder();
    const errorStream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`0:${JSON.stringify('사용자 메시지를 찾을 수 없습니다.')}\n`));
        controller.enqueue(encoder.encode('d:{"finishReason":"stop"}\n'));
        controller.close();
      },
    });
    return new Response(errorStream, {
      headers: SSE_HEADERS,
    });
  }

  // U6: orchestrated 경로(단계별 StageEvent + citation/audit/enrich). ORCHESTRATED=0으로 v1 fallback.
  const useOrchestrated = process.env.ORCHESTRATED !== '0';
  const chatPath = useOrchestrated ? '/api/chat/orchestrated' : '/api/chat';

  let backendResponse: Response;
  try {
    backendResponse = await fetch(`${BFF_URL}${chatPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: lastUserMessage.content, preset_card_id: preset_card_id ?? null }),
    });
  } catch (err) {
    const encoder = new TextEncoder();
    const errorStream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`0:${JSON.stringify('백엔드 서비스에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.')}\n`));
        controller.enqueue(encoder.encode('d:{"finishReason":"stop"}\n'));
        controller.close();
      },
    });
    return new Response(errorStream, {
      headers: SSE_HEADERS,
    });
  }

  if (!backendResponse.ok) {
    const errorText = await backendResponse.text().catch(() => '알 수 없는 오류');
    const encoder = new TextEncoder();
    const errorStream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`0:${JSON.stringify(`백엔드 오류 (${backendResponse.status}): ${errorText.slice(0, 200)}`)}\n`));
        controller.enqueue(encoder.encode('d:{"finishReason":"stop"}\n'));
        controller.close();
      },
    });
    return new Response(errorStream, {
      headers: SSE_HEADERS,
    });
  }

  if (!backendResponse.body) {
    return new Response(null, {
      headers: SSE_HEADERS,
    });
  }

  return new Response(backendResponse.body, {
    headers: SSE_HEADERS,
  });
}
