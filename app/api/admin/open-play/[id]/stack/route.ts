import { z } from "zod";
import { requirePermission } from "@/lib/guard";
import { assertCsrf } from "@/lib/auth";
import { generateStack, movePlayer } from "@/lib/openplay";
import { route, ok, readJson } from "@/lib/api";
import { audit } from "@/lib/audit";

/** Runs the auto-stacker. */
export const POST = route(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  await assertCsrf(request);
  const { id } = await ctx.params;
  const admin = await requirePermission("openplay:write");

  const { roundIndex } = z
    .object({ roundIndex: z.number().int().min(1).max(50).default(1) })
    .parse(await readJson(request));

  const result = await generateStack(id, roundIndex);

  await audit({
    userId: admin.id,
    actorEmail: admin.email,
    action: "openplay.stack",
    entity: "OpenPlaySession",
    entityId: id,
    after: { roundIndex, courts: result.groups.length, bench: result.bench.length },
  });

  return ok(result);
});

/** Manual override — move one player to another court or to the bench. */
export const PATCH = route(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  await assertCsrf(request);
  const { id } = await ctx.params;
  const admin = await requirePermission("openplay:write");

  const input = z
    .object({ playerId: z.string().min(1), groupId: z.string().min(1).nullable() })
    .parse(await readJson(request));

  const player = await movePlayer(input);

  await audit({
    userId: admin.id,
    actorEmail: admin.email,
    action: "openplay.move_player",
    entity: "OpenPlaySession",
    entityId: id,
    after: input,
  });

  return ok({ player });
});
