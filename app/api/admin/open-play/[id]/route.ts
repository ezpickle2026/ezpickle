import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/guard";
import { assertCsrf } from "@/lib/auth";
import { sessionWithCounts } from "@/lib/openplay";
import { openPlaySessionSchema } from "@/lib/validation";
import { route, ok, readJson } from "@/lib/api";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export const GET = route(async (_r: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  await requirePermission("openplay:read");
  return ok({ session: await sessionWithCounts(id) });
});

export const PATCH = route(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  await assertCsrf(request);
  const { id } = await ctx.params;
  const admin = await requirePermission("openplay:write");

  const input = openPlaySessionSchema.partial().parse(await readJson(request));
  const before = await prisma.openPlaySession.findUnique({ where: { id } });

  const session = await prisma.openPlaySession.update({
    where: { id },
    data: {
      ...(input.title ? { title: input.title } : {}),
      ...(input.skillLevel ? { skillLevel: input.skillLevel } : {}),
      ...(input.pricePerPlayer !== undefined ? { pricePerPlayer: input.pricePerPlayer } : {}),
      ...(input.courtCount !== undefined ? { courtCount: input.courtCount } : {}),
      ...(input.playersPerCourt !== undefined ? { playersPerCourt: input.playersPerCourt } : {}),
      ...(input.maxPlayers !== undefined ? { maxPlayers: input.maxPlayers } : {}),
      ...(input.minPlayers !== undefined ? { minPlayers: input.minPlayers } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    },
  });

  await audit({
    userId: admin.id,
    actorEmail: admin.email,
    action: "openplay.update",
    entity: "OpenPlaySession",
    entityId: id,
    before,
    after: session,
  });

  return ok({ session });
});
