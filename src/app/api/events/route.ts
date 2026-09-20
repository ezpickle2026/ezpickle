import { subscribe } from "@/lib/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-Sent Events stream. The booking grid subscribes here so a slot that
 * another customer just took flips to BOOKED without a page reload.
 */
export async function GET(request: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: { channel: string; data: unknown }) => {
        controller.enqueue(
          encoder.encode(`event: ${event.channel}\ndata: ${JSON.stringify(event.data)}\n\n`),
        );
      };

      send({ channel: "ready", data: { at: new Date().toISOString() } });
      const unsubscribe = subscribe(send);

      // Keep-alive comment every 25s so proxies do not drop an idle stream.
      const ping = setInterval(() => controller.enqueue(encoder.encode(": ping\n\n")), 25_000);

      request.signal.addEventListener("abort", () => {
        clearInterval(ping);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
