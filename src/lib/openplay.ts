import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { AppError, Errors } from "./errors";
import { getSettings } from "./settings";
import { stackPlayers, pairKey, type StackPlayer } from "./stacking";
import { notify } from "./notifications";
import { publish } from "./realtime";

const LIVE_PLAYER_STATUSES = ["PENDING_PAYMENT", "REGISTERED", "CHECKED_IN"] as const;

export async function sessionWithCounts(sessionId: string) {
  const session = await prisma.openPlaySession.findUnique({
    where: { id: sessionId },
    include: {
      players: {
        where: { status: { in: [...LIVE_PLAYER_STATUSES] } },
        include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
        orderBy: { joinedAt: "asc" },
      },
      groups: {
        include: {
          players: { include: { user: { select: { fullName: true, avatarUrl: true } } } },
          court: { select: { name: true } },
        },
        orderBy: { label: "asc" },
      },
      waitlist: { where: { status: { in: ["WAITING", "OFFERED"] } }, orderBy: { position: "asc" } },
    },
  });
  if (!session) throw Errors.notFound("That Open Play session");
  return session;
}

/**
 * Joins a player. Capacity is enforced inside a serializable transaction with
 * a per-session advisory lock so the Nth+1 player can never slip in.
 */
export async function joinSession(params: {
  sessionId: string;
  userId: string;
  skillRating?: number;
  preferredSide?: string | null;
}) {
  const settings = await getSettings();

  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${params.sessionId}))`;

      const session = await tx.openPlaySession.findUnique({ where: { id: params.sessionId } });
      if (!session) throw Errors.notFound("That Open Play session");
      if (!["OPEN", "FULL"].includes(session.status)) {
        throw new AppError("Registration for this session is closed.", 409, "session_closed");
      }
      if (session.startAt < new Date()) {
        throw new AppError("This session has already started.", 409, "session_started");
      }

      // Reclaim lapsed holds before measuring capacity.
      await tx.openPlayPlayer.updateMany({
        where: {
          sessionId: session.id,
          status: "PENDING_PAYMENT",
          holdExpiresAt: { lt: new Date() },
        },
        data: { status: "EXPIRED" },
      });

      const existing = await tx.openPlayPlayer.findUnique({
        where: { sessionId_userId: { sessionId: session.id, userId: params.userId } },
      });
      if (existing && (LIVE_PLAYER_STATUSES as readonly string[]).includes(existing.status)) {
        throw new AppError("You are already registered for this session.", 409, "already_joined");
      }

      const taken = await tx.openPlayPlayer.count({
        where: { sessionId: session.id, status: { in: [...LIVE_PLAYER_STATUSES] } },
      });
      if (taken >= session.maxPlayers) {
        await tx.openPlaySession.update({
          where: { id: session.id },
          data: { status: "FULL" },
        });
        throw Errors.sessionFull();
      }

      const holdExpiresAt = new Date(Date.now() + settings.openPlayHoldMinutes * 60_000);
      const data = {
        skillRating: params.skillRating ?? 3.0,
        preferredSide: params.preferredSide ?? null,
        status: "PENDING_PAYMENT" as const,
        holdExpiresAt,
        cancelledAt: null,
        joinedAt: new Date(),
      };

      const player = existing
        ? await tx.openPlayPlayer.update({ where: { id: existing.id }, data })
        : await tx.openPlayPlayer.create({
            data: { sessionId: session.id, userId: params.userId, ...data },
          });

      if (taken + 1 >= session.maxPlayers) {
        await tx.openPlaySession.update({ where: { id: session.id }, data: { status: "FULL" } });
      }

      return { player, session, spotsTaken: taken + 1 };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 },
  );
}

export async function leaveSession(params: { sessionId: string; userId: string }) {
  const player = await prisma.openPlayPlayer.findUnique({
    where: { sessionId_userId: { sessionId: params.sessionId, userId: params.userId } },
  });
  if (!player) throw Errors.notFound("Your registration");

  await prisma.openPlayPlayer.update({
    where: { id: player.id },
    data: { status: "CANCELLED", cancelledAt: new Date(), groupId: null },
  });

  await prisma.openPlaySession.update({
    where: { id: params.sessionId },
    data: { status: "OPEN" },
  });

  await promoteWaitlist(params.sessionId);
  await publish("openplay", { type: "roster_changed", sessionId: params.sessionId });

  return { ok: true };
}

export async function joinWaitlist(params: { sessionId: string; userId: string }) {
  const last = await prisma.waitlist.findFirst({
    where: { sessionId: params.sessionId },
    orderBy: { position: "desc" },
  });

  return prisma.waitlist.upsert({
    where: { sessionId_userId: { sessionId: params.sessionId, userId: params.userId } },
    create: {
      sessionId: params.sessionId,
      userId: params.userId,
      position: (last?.position ?? 0) + 1,
    },
    update: { status: "WAITING" },
  });
}

/**
 * Offers the freed seat to the next person in line and starts their payment
 * clock. If they let it lapse the sweeper calls this again for the next player.
 */
export async function promoteWaitlist(sessionId: string) {
  const settings = await getSettings();

  const session = await prisma.openPlaySession.findUnique({ where: { id: sessionId } });
  if (!session || session.startAt < new Date()) return null;

  const taken = await prisma.openPlayPlayer.count({
    where: { sessionId, status: { in: [...LIVE_PLAYER_STATUSES] } },
  });
  const outstandingOffers = await prisma.waitlist.count({
    where: { sessionId, status: "OFFERED", offerExpiresAt: { gt: new Date() } },
  });

  if (taken + outstandingOffers >= session.maxPlayers) return null;

  const next = await prisma.waitlist.findFirst({
    where: { sessionId, status: "WAITING" },
    orderBy: { position: "asc" },
    include: { user: { select: { email: true, fullName: true, id: true } } },
  });
  if (!next) return null;

  const offerExpiresAt = new Date(Date.now() + settings.waitlistOfferMinutes * 60_000);

  const offered = await prisma.waitlist.update({
    where: { id: next.id },
    data: { status: "OFFERED", offeredAt: new Date(), offerExpiresAt },
  });

  await notify({
    userId: next.user.id,
    to: next.user.email,
    template: "waitlist_promoted",
    payload: {
      session: session.title,
      expiresIn: `${settings.waitlistOfferMinutes} minutes`,
      claimUrl: `/open-play/${sessionId}`,
    },
  });

  await publish("openplay", { type: "waitlist_promoted", sessionId, userId: next.user.id });

  return offered;
}

/** Runs the stacker over paid players and persists the assignment. */
export async function generateStack(sessionId: string, roundIndex = 1) {
  const session = await prisma.openPlaySession.findUnique({
    where: { id: sessionId },
    include: {
      players: {
        where: { status: { in: ["REGISTERED", "CHECKED_IN"] } },
        include: { user: { select: { fullName: true, email: true, id: true } } },
      },
    },
  });
  if (!session) throw Errors.notFound("That Open Play session");

  const roster: StackPlayer[] = session.players.map((p) => ({
    id: p.id,
    name: p.user.fullName,
    rating: p.skillRating,
  }));

  if (roster.length === 0) {
    throw new AppError("No paid players to stack yet.", 409, "empty_roster");
  }

  const historyRows = await prisma.playerPairHistory.findMany({
    where: {
      OR: [
        { playerAId: { in: roster.map((r) => r.id) } },
        { playerBId: { in: roster.map((r) => r.id) } },
      ],
    },
  });
  const pairHistory = Object.fromEntries(
    historyRows.map((row) => [pairKey(row.playerAId, row.playerBId), row.times]),
  );

  const courts = await prisma.court.findMany({
    where: { active: true, deletedAt: null },
    orderBy: { number: "asc" },
    take: session.courtCount,
  });

  const result = stackPlayers(roster, {
    courtCount: session.courtCount,
    playersPerCourt: session.playersPerCourt,
    pairHistory,
    courtLabels: courts.map((c) => c.name),
  });

  await prisma.$transaction(async (tx) => {
    await tx.openPlayPlayer.updateMany({ where: { sessionId }, data: { groupId: null } });
    await tx.openPlayGroup.deleteMany({ where: { sessionId, roundIndex } });

    for (const group of result.groups) {
      const created = await tx.openPlayGroup.create({
        data: {
          sessionId,
          courtId: courts[group.courtIndex]?.id ?? null,
          label: group.label,
          roundIndex,
          avgRating: group.avgRating,
        },
      });
      await tx.openPlayPlayer.updateMany({
        where: { id: { in: group.players.map((p) => p.id) } },
        data: { groupId: created.id },
      });

      // Remember who played with whom so the next round mixes things up.
      for (let i = 0; i < group.players.length; i++) {
        for (let j = i + 1; j < group.players.length; j++) {
          const [a, b] = [group.players[i].id, group.players[j].id].sort();
          await tx.playerPairHistory.upsert({
            where: { playerAId_playerBId: { playerAId: a, playerBId: b } },
            create: { playerAId: a, playerBId: b },
            update: { times: { increment: 1 }, lastAt: new Date() },
          });
        }
      }
    }
  });

  await publish("openplay", { type: "stack_generated", sessionId, roundIndex });

  for (const group of result.groups) {
    for (const p of group.players) {
      const player = session.players.find((sp) => sp.id === p.id);
      if (!player) continue;
      await notify({
        userId: player.user.id,
        to: player.user.email,
        template: "openplay_stacked",
        payload: { session: session.title, court: group.label, round: roundIndex },
      });
    }
  }

  return result;
}

/** Manual admin override — drags a player onto another court. */
export async function movePlayer(params: { playerId: string; groupId: string | null }) {
  const player = await prisma.openPlayPlayer.update({
    where: { id: params.playerId },
    data: { groupId: params.groupId },
  });
  if (params.groupId) {
    await prisma.openPlayGroup.update({ where: { id: params.groupId }, data: { manual: true } });
  }
  await publish("openplay", { type: "stack_changed", sessionId: player.sessionId });
  return player;
}
