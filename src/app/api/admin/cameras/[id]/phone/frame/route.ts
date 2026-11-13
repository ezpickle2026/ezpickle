import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/guard";
import { assertCsrf } from "@/lib/auth";
import { route, ok } from "@/lib/api";
import { AppError, Errors } from "@/lib/errors";
import { MAX_FRAME_BYTES, clearFrames, saveFrame } from "@/lib/phonecam";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** One live JPEG frame from the phone camera page. */
export const POST = route(async (request: Request, ctx: Ctx) => {
  await assertCsrf(request);
  await requirePermission("cam:write");
  const { id } = await ctx.params;

  const camera = await prisma.courtCamera.findUnique({ where: { id }, select: { id: true, active: true } });
  if (!camera || !camera.active) throw Errors.notFound("That camera");

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_FRAME_BYTES) {
    throw new AppError("Frame is empty or too large.", 413, "too_large");
  }
  await saveFrame(id, bytes);
  return ok({ at: Date.now() });
});

/** The phone stopped: the live feed ends right away. */
export const DELETE = route(async (request: Request, ctx: Ctx) => {
  await assertCsrf(request);
  await requirePermission("cam:write");
  const { id } = await ctx.params;
  clearFrames(id);
  return ok({ stopped: true });
});
