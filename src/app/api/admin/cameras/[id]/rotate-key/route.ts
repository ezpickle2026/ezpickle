import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/guard";
import { assertCsrf } from "@/lib/auth";
import { route, ok } from "@/lib/api";
import { audit } from "@/lib/audit";
import { newCameraKey } from "@/lib/picklecam";

/** Issues a new connection key. The old key stops working immediately. */
export const POST = route(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  await assertCsrf(request);
  const { id } = await ctx.params;
  const user = await requirePermission("cam:write");

  const key = newCameraKey();
  await prisma.courtCamera.update({
    where: { id },
    data: { ingestKeyHash: key.hash, ingestKeyHint: key.hint, lastSeenAt: null },
  });
  await audit({
    userId: user.id,
    actorEmail: user.email,
    action: "camera.rotate_key",
    entity: "CourtCamera",
    entityId: id,
  });
  return ok({ key: key.key });
});
