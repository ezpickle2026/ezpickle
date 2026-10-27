import "server-only";
import { prisma } from "./prisma";
import { publish } from "./realtime";
import { promoteWaitlist } from "./openplay";

/**
 * Releases court and Open Play slots whose payment window has lapsed.
 * Idempotent and safe to run concurrently — every update is conditional on the
 * row still being in the holding state.
 */
export async function releaseExpiredHolds() {
  const now = new Date();

  const expiring = await prisma.booking.findMany({
    where: { status: "PAYMENT_PENDING", holdExpiresAt: { lt: now } },
    select: { id: true, courtId: true, startAt: true },
  });

  const bookings = await prisma.booking.updateMany({
    where: { status: "PAYMENT_PENDING", holdExpiresAt: { lt: now } },
    data: { status: "EXPIRED" },
  });

  for (const b of expiring) {
    await publish("availability", {
      type: "slot_changed",
      courtId: b.courtId,
      date: b.startAt.toISOString().slice(0, 10),
      state: "AVAILABLE",
    });
  }

  const expiredPlayers = await prisma.openPlayPlayer.findMany({
    where: { status: "PENDING_PAYMENT", holdExpiresAt: { lt: now } },
    select: { id: true, sessionId: true },
  });

  const openPlay = await prisma.openPlayPlayer.updateMany({
    where: { status: "PENDING_PAYMENT", holdExpiresAt: { lt: now } },
    data: { status: "EXPIRED" },
  });

  // Expire lapsed waitlist offers and move the queue forward.
  const lapsedOffers = await prisma.waitlist.findMany({
    where: { status: "OFFERED", offerExpiresAt: { lt: now } },
    select: { id: true, sessionId: true },
  });
  if (lapsedOffers.length) {
    await prisma.waitlist.updateMany({
      where: { id: { in: lapsedOffers.map((o) => o.id) } },
      data: { status: "EXPIRED" },
    });
  }

  const touchedSessions = new Set([
    ...expiredPlayers.map((p) => p.sessionId),
    ...lapsedOffers.map((o) => o.sessionId),
  ]);
  for (const sessionId of touchedSessions) {
    await promoteWaitlist(sessionId);
  }

  return { bookings: bookings.count, openPlay: openPlay.count, offers: lapsedOffers.length };
}
