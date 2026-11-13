import { z } from "zod";
import { requireUser, assertCsrf } from "@/lib/auth";
import { assertCanOperate, deleteGame, recordGame } from "@/lib/openplay";
import { route, ok, readJson } from "@/lib/api";
import { audit } from "@/lib/audit";

const score = z.number().int().min(0).max(99);

/** Operator records (or corrects) the final score of a court's game. */
export const POST = route(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  await assertCsrf(request);
  const { id } = await ctx.params;
  const user = await requireUser();
  await assertCanOperate(id, user);

  const input = z
    .object({ groupId: z.string().min(1), scoreA: score, scoreB: score })
    .parse(await readJson(request));

  const game = await recordGame({ sessionId: id, recordedById: user.id, ...input });

  await audit({
    userId: user.id,
    actorEmail: user.email,
    action: "openplay.record_game",
    entity: "OpenPlaySession",
    entityId: id,
    after: { gameId: game.id, ...input },
  });

  return ok({ game: { id: game.id } });
});

export const DELETE = route(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  await assertCsrf(request);
  const { id } = await ctx.params;
  const user = await requireUser();
  await assertCanOperate(id, user);

  const { gameId } = z.object({ gameId: z.string().min(1) }).parse(await readJson(request));
  await deleteGame({ sessionId: id, gameId });

  await audit({
    userId: user.id,
    actorEmail: user.email,
    action: "openplay.delete_game",
    entity: "OpenPlaySession",
    entityId: id,
    after: { gameId },
  });

  return ok({ deleted: true });
});
