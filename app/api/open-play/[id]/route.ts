import { sessionWithCounts } from "@/lib/openplay";
import { getSessionUser } from "@/lib/auth";
import { route, ok } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = route(async (_request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const user = await getSessionUser();
  const session = await sessionWithCounts(id);

  const me = user ? session.players.find((p) => p.userId === user.id) ?? null : null;
  const myWaitlist = user ? session.waitlist.find((w) => w.userId === user.id) ?? null : null;

  return ok({
    session: {
      id: session.id,
      title: session.title,
      startAt: session.startAt,
      endAt: session.endAt,
      skillLevel: session.skillLevel,
      pricePerPlayer: session.pricePerPlayer,
      maxPlayers: session.maxPlayers,
      minPlayers: session.minPlayers,
      courtCount: session.courtCount,
      playersPerCourt: session.playersPerCourt,
      status: session.status,
      notes: session.notes,
    },
    taken: session.players.length,
    // Public roster shows first names only — full names stay internal.
    players: session.players.map((p) => ({
      id: p.id,
      name: p.user.fullName.split(" ")[0],
      avatarUrl: p.user.avatarUrl,
      status: p.status,
      rating: p.skillRating,
    })),
    groups: session.groups.map((g) => ({
      id: g.id,
      label: g.label,
      court: g.court?.name ?? g.label,
      avgRating: g.avgRating,
      players: g.players.map((p) => ({ id: p.id, name: p.user.fullName, rating: p.skillRating })),
    })),
    waitlistCount: session.waitlist.length,
    me: me ? { id: me.id, status: me.status, holdExpiresAt: me.holdExpiresAt } : null,
    myWaitlist: myWaitlist
      ? { status: myWaitlist.status, position: myWaitlist.position, offerExpiresAt: myWaitlist.offerExpiresAt }
      : null,
  });
});
