import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/guard";
import { assertCsrf } from "@/lib/auth";
import { route, ok, readJson } from "@/lib/api";
import { audit } from "@/lib/audit";
import { Errors } from "@/lib/errors";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  published: z.boolean().optional(),
  title: z.string().trim().max(120).nullable().optional(),
});

/** Hide or show a replay to players, or rename it. */
export const PATCH = route(async (request: Request, ctx: Ctx) => {
  await assertCsrf(request);
  const { id } = await ctx.params;
  const user = await requirePermission("cam:write");

  const before = await prisma.courtRecording.findUnique({ where: { id } });
  if (!before) throw Errors.notFound("That recording");

  const input = patchSchema.parse(await readJson(request));
  const recording = await prisma.courtRecording.update({ where: { id }, data: input });

  await audit({
    userId: user.id,
    actorEmail: user.email,
    action: "recording.update",
    entity: "CourtRecording",
    entityId: id,
    before: { published: before.published, title: before.title },
    after: { published: recording.published, title: recording.title },
  });
  return ok({ updated: true });
});

/** Removes the link from EzPickle. The file on the recorder is not touched. */
export const DELETE = route(async (request: Request, ctx: Ctx) => {
  await assertCsrf(request);
  const { id } = await ctx.params;
  const user = await requirePermission("cam:write");

  const recording = await prisma.courtRecording.delete({ where: { id } });
  await audit({
    userId: user.id,
    actorEmail: user.email,
    action: "recording.delete",
    entity: "CourtRecording",
    entityId: id,
    before: { courtId: recording.courtId, startAt: recording.startAt, videoUrl: recording.videoUrl },
  });
  return ok({ deleted: true });
});
