import { prisma } from "@/lib/prisma";
import { sessionWithCounts, playerRecord } from "@/lib/openplay";
import { splitTeams } from "@/lib/stacking";
import { getSessionUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { route, ok } from "@/lib/api";

export const dynamic = "force-dynamic";

const PAID = new Set(["REGISTERED", "CHECKED_IN"]);

export const GET = route(async (_request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const user = await getSessionUser();
  const session = await sessionWithCounts(id);

  const me = user ? session.players.find((p) => p.userId === user.id) ?? null : null;
  const myWaitlist = user ? session.waitlist.find((w) => w.userId === user.id) ?? null : null;
  const canOperate = Boolean(
    user && (can(user.role, "openplay:write") || session.operatorUserId === user.id),
  );

  // Only the latest round is on court; older rounds' groups are empty shells.
  const round = Math.max(0, ...session.groups.map((g) => g.roundIndex));
  const current = session.groups.filter((g) => g.roundIndex === round && g.players.length > 0);
  const gameByGroup = new Map(
    session.games.filter((g) => g.groupId).map((g) => [g.groupId as string, g]),
  );

  // Names for the game log, including players who have since left.
  const referenced = [...new Set(session.games.flatMap((g) => [...g.teamA, ...g.teamB]))];
  const nameRows = referenced.length
    ? await prisma.openPlayPlayer.findMany({
        where: { id: { in: referenced } },
        select: { id: true, user: { select: { fullName: true } } },
      })
    : [];
  const firstName = new Map(nameRows.map((r) => [r.id, r.user.fullName.split(" ")[0]]));
  const names = (ids: string[]) => ids.map((pid) => ({ id: pid, name: firstName.get(pid) ?? "Player" }));

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
      rotationMins: session.rotationMins,
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
      groupId: p.groupId,
    })),
    round,
    groups: current.map((g) => {
      const players = g.players.map((p) => ({ id: p.id, name: p.user.fullName, rating: p.skillRating }));
      const teams = splitTeams(players.map((p) => ({ ...p, rating: p.rating })));
      const game = gameByGroup.get(g.id);
      return {
        id: g.id,
        label: g.label,
        court: g.court?.name ?? g.label,
        avgRating: g.avgRating,
        createdAt: g.createdAt,
        players,
        teamA: teams.teamA,
        teamB: teams.teamB,
        game: game ? { id: game.id, scoreA: game.scoreA, scoreB: game.scoreB } : null,
      };
    }),
    bench: session.players
      .filter((p) => !p.groupId && PAID.has(p.status))
      .map((p) => ({ id: p.id, name: p.user.fullName.split(" ")[0], rating: p.skillRating })),
    games: session.games.map((g) => ({
      id: g.id,
      roundIndex: g.roundIndex,
      court: g.courtLabel,
      teamA: names(g.teamA),
      teamB: names(g.teamB),
      scoreA: g.scoreA,
      scoreB: g.scoreB,
    })),
    operator: session.operator
      ? { id: session.operator.id, name: session.operator.fullName.split(" ")[0] }
      : null,
    canOperate,
    waitlistCount: session.waitlist.length,
    me: me
      ? {
          id: me.id,
          status: me.status,
          holdExpiresAt: me.holdExpiresAt,
          groupId: me.groupId,
          record: playerRecord(me.id, session.games),
        }
      : null,
    myWaitlist: myWaitlist
      ? { status: myWaitlist.status, position: myWaitlist.position, offerExpiresAt: myWaitlist.offerExpiresAt }
      : null,
  });
});
