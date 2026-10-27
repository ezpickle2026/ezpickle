import { requireUser, assertCsrf } from "@/lib/auth";
import { joinSession, leaveSession } from "@/lib/openplay";
import { joinOpenPlaySchema } from "@/lib/validation";
import { route, ok, readJson } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { publish } from "@/lib/realtime";

export const POST = route(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  await assertCsrf(request);
  const { id } = await ctx.params;
  const user = await requireUser();
  await rateLimit(`openplay:join:${user.id}`, 15, 600);

  const input = joinOpenPlaySchema.parse(await readJson(request));

  const { player, session, spotsTaken } = await joinSession({
    sessionId: id,
    userId: user.id,
    skillRating: input.skillRating,
    preferredSide: input.preferredSide,
  });

  await publish("openplay", { type: "roster_changed", sessionId: id, taken: spotsTaken });

  return ok(
    {
      playerId: player.id,
      holdExpiresAt: player.holdExpiresAt,
      amount: session.pricePerPlayer,
      taken: spotsTaken,
      maxPlayers: session.maxPlayers,
    },
    { status: 201 },
  );
});

export const DELETE = route(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  await assertCsrf(request);
  const { id } = await ctx.params;
  const user = await requireUser();
  return ok(await leaveSession({ sessionId: id, userId: user.id }));
});
