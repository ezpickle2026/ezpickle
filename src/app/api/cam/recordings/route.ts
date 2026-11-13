import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { route, ok } from "@/lib/api";
import {
  PLAYABLE,
  REPLAY_DAYS,
  isOnline,
  matchWindow,
  overlapWhere,
  playWindowsFor,
} from "@/lib/picklecam";

export const dynamic = "force-dynamic";

/**
 * The signed-in player's Pickle Cam library: replays from the courts they
 * played on, while they played there, plus any court camera they can watch
 * live right now because their slot on it is running.
 */
export const GET = route(async () => {
  const user = await requireUser();
  const now = new Date();
  const since = new Date(now.getTime() - REPLAY_DAYS * 864e5);
  const windows = await playWindowsFor(user.id, since);

  const recordings = await prisma.courtRecording.findMany({
    where: { AND: [PLAYABLE, { startAt: { gte: since } }, overlapWhere(windows)] },
    orderBy: { startAt: "desc" },
    take: 200,
    select: {
      id: true,
      courtId: true,
      title: true,
      startAt: true,
      endAt: true,
      thumbnailUrl: true,
      court: { select: { name: true, number: true } },
    },
  });

  const liveWindows = windows.filter((w) => w.startAt <= now && w.endAt > now);
  const cameras = liveWindows.length
    ? await prisma.courtCamera.findMany({
        where: {
          active: true,
          liveUrl: { not: null },
          courtId: { in: [...new Set(liveWindows.map((w) => w.courtId))] },
        },
        select: {
          id: true,
          name: true,
          courtId: true,
          lastSeenAt: true,
          court: { select: { name: true, number: true } },
        },
      })
    : [];

  return ok({
    replayDays: REPLAY_DAYS,
    recordings: recordings.map(({ courtId, ...r }) => {
      const match = matchWindow({ courtId, startAt: r.startAt, endAt: r.endAt }, windows);
      return { ...r, match: match && { kind: match.kind, label: match.label } };
    }),
    live: cameras.map((c) => ({
      id: c.id,
      name: c.name,
      court: c.court,
      online: isOnline(c.lastSeenAt, now),
      until: liveWindows.find((w) => w.courtId === c.courtId)?.endAt ?? null,
    })),
  });
});
