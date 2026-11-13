import { z } from "zod";
import { requireUser, assertCsrf } from "@/lib/auth";
import { assertCanOperate, generateStack, movePlayer } from "@/lib/openplay";
import { route, ok, readJson } from "@/lib/api";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Stacker controls for the session's operator — a member the admin picked to
 * run rounds from their own phone. Admins can use these too.
 */
export const POST = route(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  await assertCsrf(request);
  const { id } = await ctx.params;
  const user = await requireUser();
  await assertCanOperate(id, user);
  await rateLimit(`openplay:operate:${user.id}`, 60, 600);

  const { roundIndex } = z
    .object({ roundIndex: z.number().int().min(1).max(50).default(1) })
    .parse(await readJson(request));

  const result = await generateStack(id, roundIndex);

  await audit({
    userId: user.id,
    actorEmail: user.email,
    action: "openplay.stack",
    entity: "OpenPlaySession",
    entityId: id,
    after: { roundIndex, courts: result.groups.length, bench: result.bench.length, by: "operator" },
  });

  return ok(result);
});

export const PATCH = route(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  await assertCsrf(request);
  const { id } = await ctx.params;
  const user = await requireUser();
  await assertCanOperate(id, user);

  const input = z
    .object({ playerId: z.string().min(1), groupId: z.string().min(1).nullable() })
    .parse(await readJson(request));

  const player = await movePlayer({ sessionId: id, ...input });

  await audit({
    userId: user.id,
    actorEmail: user.email,
    action: "openplay.move_player",
    entity: "OpenPlaySession",
    entityId: id,
    after: { ...input, by: "operator" },
  });

  return ok({ player: { id: player.id, groupId: player.groupId } });
});
