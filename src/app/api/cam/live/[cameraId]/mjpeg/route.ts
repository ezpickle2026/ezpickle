import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { liveWindowNow } from "@/lib/picklecam";
import { latestFrame } from "@/lib/phonecam";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BOUNDARY = "ezpframe";
const MAX_STREAM_MS = 30 * 60 * 1000;

/**
 * Live view of a phone camera as an MJPEG stream (plays in a plain <img>).
 * Same rule as the live API: staff always, players only during their slot.
 */
export async function GET(request: Request, ctx: { params: Promise<{ cameraId: string }> }) {
  const { cameraId } = await ctx.params;
  const user = await getSessionUser();
  const camera = user ? await prisma.courtCamera.findUnique({ where: { id: cameraId } }) : null;
  if (!user || !camera || !camera.active) return new Response("Not found", { status: 404 });

  let until = Date.now() + MAX_STREAM_MS;
  if (!can(user.role, "cam:read")) {
    const window = await liveWindowNow(user.id, camera.courtId);
    if (!window) return new Response("Not found", { status: 404 });
    until = Math.min(until, window.endAt.getTime());
  }

  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;
  const stop = (controller?: ReadableStreamDefaultController) => {
    clearInterval(timer);
    try {
      controller?.close();
    } catch {
      /* already closed */
    }
  };

  const stream = new ReadableStream({
    start(controller) {
      let last = 0;
      const push = () => {
        if (Date.now() > until) return stop(controller);
        const frame = latestFrame(cameraId);
        if (!frame || frame.at === last) return;
        last = frame.at;
        controller.enqueue(
          encoder.encode(`--${BOUNDARY}\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.bytes.length}\r\n\r\n`),
        );
        controller.enqueue(frame.bytes);
        controller.enqueue(encoder.encode("\r\n"));
      };
      push();
      timer = setInterval(push, 250);
      request.signal.addEventListener("abort", () => stop(controller));
    },
    cancel() {
      stop();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": `multipart/x-mixed-replace; boundary=${BOUNDARY}`,
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
