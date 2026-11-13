import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { CourtRecording, Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { can } from "./rbac";
import type { SessionUser } from "./auth";

/**
 * Pickle Cam: court cameras and the recordings they upload.
 *
 * Access rule for players: a recording is yours when it was filmed on a court
 * you played on, during the time you played there. "Played" means a paid
 * booking on that court, or an Open Play session you joined that put players
 * on that court. Staff with `cam:read` see everything.
 */

/** How long players can go back and find their replays. */
export const REPLAY_DAYS = 30;

/** A camera that has not called in for this long is shown as offline. */
export const ONLINE_WINDOW_MS = 3 * 60 * 1000;

/** Booking states that mean the customer really had the court. */
const PLAYED_BOOKING = ["CONFIRMED", "CHECKED_IN", "COMPLETED"] as const;
const PLAYED_OPEN_PLAY = ["REGISTERED", "CHECKED_IN"] as const;

// ------------------------------------------------------------- camera keys

export function hashCameraKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

/** A new camera key. Shown to staff once; only its hash is stored. */
export function newCameraKey() {
  const key = `ezcam_${randomBytes(24).toString("base64url")}`;
  return { key, hash: hashCameraKey(key), hint: key.slice(-4) };
}

export function cameraKeyFromRequest(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim() || null;
  return request.headers.get("x-camera-key")?.trim() || null;
}

export function isOnline(lastSeenAt: Date | null, now = new Date()) {
  return Boolean(lastSeenAt && now.getTime() - lastSeenAt.getTime() < ONLINE_WINDOW_MS);
}

// ------------------------------------------------------------- play windows

/** One stretch of time a player was on one court. */
export type PlayWindow = {
  courtId: string;
  startAt: Date;
  endAt: Date;
  kind: "booking" | "open_play";
  label: string; // booking reference or Open Play title
  refId: string;
};

export async function playWindowsFor(userId: string, since: Date, until = new Date(Date.now() + 864e5)) {
  const [bookings, players] = await Promise.all([
    prisma.booking.findMany({
      where: {
        customerId: userId,
        status: { in: [...PLAYED_BOOKING] },
        endAt: { gte: since },
        startAt: { lte: until },
      },
      select: { id: true, reference: true, courtId: true, startAt: true, endAt: true },
    }),
    prisma.openPlayPlayer.findMany({
      where: {
        userId,
        status: { in: [...PLAYED_OPEN_PLAY] },
        session: { endAt: { gte: since }, startAt: { lte: until }, status: { not: "CANCELLED" } },
      },
      select: {
        session: {
          select: {
            id: true,
            title: true,
            startAt: true,
            endAt: true,
            groups: { where: { courtId: { not: null } }, select: { courtId: true } },
          },
        },
      },
    }),
  ]);

  const windows: PlayWindow[] = bookings.map((b) => ({
    courtId: b.courtId,
    startAt: b.startAt,
    endAt: b.endAt,
    kind: "booking",
    label: b.reference,
    refId: b.id,
  }));

  for (const { session } of players) {
    const courts = new Set(session.groups.map((g) => g.courtId as string));
    for (const courtId of courts) {
      windows.push({
        courtId,
        startAt: session.startAt,
        endAt: session.endAt,
        kind: "open_play",
        label: session.title,
        refId: session.id,
      });
    }
  }
  return windows;
}

/** Prisma filter: recordings that overlap any of these windows on the same court. */
export function overlapWhere(windows: PlayWindow[]): Prisma.CourtRecordingWhereInput {
  if (windows.length === 0) return { id: { in: [] } };
  return {
    OR: windows.map((w) => ({
      courtId: w.courtId,
      startAt: { lt: w.endAt },
      // A clip still being recorded has no end yet; its start is enough.
      OR: [{ endAt: { gt: w.startAt } }, { endAt: null, startAt: { gte: w.startAt } }],
    })),
  };
}

export function overlaps(
  rec: Pick<CourtRecording, "courtId" | "startAt" | "endAt">,
  w: Pick<PlayWindow, "courtId" | "startAt" | "endAt">,
) {
  if (rec.courtId !== w.courtId || rec.startAt >= w.endAt) return false;
  // A clip still being recorded has no end yet; its start must fall in the slot.
  return rec.endAt ? rec.endAt > w.startAt : rec.startAt >= w.startAt;
}

/** The game a recording belongs to, from this player's point of view. */
export function matchWindow(
  rec: Pick<CourtRecording, "courtId" | "startAt" | "endAt">,
  windows: PlayWindow[],
) {
  return windows.find((w) => overlaps(rec, w)) ?? null;
}

/** What a player may watch: published, ready clips from their own games. */
export const PLAYABLE: Prisma.CourtRecordingWhereInput = {
  published: true,
  status: "READY",
  videoUrl: { not: null },
};

export async function canWatchRecording(user: SessionUser, rec: CourtRecording) {
  if (can(user.role, "cam:read")) return true;
  if (!rec.published || rec.status !== "READY") return false;
  const since = new Date(Date.now() - REPLAY_DAYS * 864e5);
  if (rec.startAt < since) return false;
  const windows = await playWindowsFor(user.id, since);
  return windows.some((w) => overlaps(rec, w));
}

/** Players see a court's live feed only while their own slot on it is running. */
export async function liveWindowNow(userId: string, courtId: string, now = new Date()) {
  const windows = await playWindowsFor(userId, new Date(now.getTime() - 864e5), now);
  return windows.find((w) => w.courtId === courtId && w.startAt <= now && w.endAt > now) ?? null;
}

/**
 * The booking a recording most likely belongs to: the one on that court with
 * the largest time overlap. Stored only as a convenience for staff; player
 * access is always worked out from the time windows above.
 */
export async function bestBookingFor(courtId: string, startAt: Date, endAt: Date | null) {
  const end = endAt ?? startAt;
  const candidates = await prisma.booking.findMany({
    where: {
      courtId,
      status: { in: [...PLAYED_BOOKING] },
      startAt: { lt: endAt ?? new Date(startAt.getTime() + 60_000) },
      endAt: { gt: startAt },
    },
    select: { id: true, startAt: true, endAt: true },
  });
  let best: { id: string; overlap: number } | null = null;
  for (const b of candidates) {
    const overlap =
      Math.min(b.endAt.getTime(), Math.max(end.getTime(), startAt.getTime() + 1)) -
      Math.max(b.startAt.getTime(), startAt.getTime());
    if (overlap > 0 && (!best || overlap > best.overlap)) best = { id: b.id, overlap };
  }
  return best?.id ?? null;
}
