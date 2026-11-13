import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { route, ok } from "@/lib/api";
import { Errors } from "@/lib/errors";
import { can } from "@/lib/rbac";
import { isOnline, liveWindowNow } from "@/lib/picklecam";

export const dynamic = "force-dynamic";

/**
 * Live feed of a court camera. Staff can always watch; a player only while
 * their own booking or Open Play session on that court is in progress.
 */
export const GET = route(async (_request: Request, ctx: { params: Promise<{ cameraId: string }> }) => {
  const user = await requireUser();
  const { cameraId } = await ctx.params;

  const camera = await prisma.courtCamera.findUnique({
    where: { id: cameraId },
    include: { court: { select: { name: true, number: true } } },
  });
  if (!camera || !camera.active || !camera.liveUrl) throw Errors.notFound("That camera");

  let until: Date | null = null;
  if (!can(user.role, "cam:read")) {
    const window = await liveWindowNow(user.id, camera.courtId);
    if (!window) throw Errors.notFound("That camera");
    until = window.endAt;
  }

  return ok(
    {
      live: {
        id: camera.id,
        name: camera.name,
        court: camera.court,
        src: camera.liveUrl,
        type: camera.liveType,
        online: isOnline(camera.lastSeenAt),
        until,
      },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
});
