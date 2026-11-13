import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/guard";
import { assertCsrf } from "@/lib/auth";
import { cameraSchema } from "@/lib/validation";
import { route, ok, readJson } from "@/lib/api";
import { audit } from "@/lib/audit";
import { Errors } from "@/lib/errors";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route(async (request: Request, ctx: Ctx) => {
  await assertCsrf(request);
  const { id } = await ctx.params;
  const user = await requirePermission("cam:write");

  const before = await prisma.courtCamera.findUnique({ where: { id } });
  if (!before) throw Errors.notFound("That camera");

  const input = cameraSchema.partial().parse(await readJson(request));
  const camera = await prisma.courtCamera.update({ where: { id }, data: input });

  await audit({
    userId: user.id,
    actorEmail: user.email,
    action: "camera.update",
    entity: "CourtCamera",
    entityId: id,
    before: { courtId: before.courtId, name: before.name, liveUrl: before.liveUrl, active: before.active },
    after: { courtId: camera.courtId, name: camera.name, liveUrl: camera.liveUrl, active: camera.active },
  });
  return ok({ updated: true });
});

/** Removes the camera. Its recordings stay and remain watchable. */
export const DELETE = route(async (request: Request, ctx: Ctx) => {
  await assertCsrf(request);
  const { id } = await ctx.params;
  const user = await requirePermission("cam:write");

  const camera = await prisma.courtCamera.delete({ where: { id } });
  await audit({
    userId: user.id,
    actorEmail: user.email,
    action: "camera.delete",
    entity: "CourtCamera",
    entityId: id,
    before: { courtId: camera.courtId, name: camera.name },
  });
  return ok({ deleted: true });
});
