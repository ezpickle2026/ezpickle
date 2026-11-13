import "server-only";
import { prisma } from "./prisma";

/**
 * Phone camera support: an iPhone/Android browser on the court acts as the
 * camera. It posts a JPEG frame about once a second (kept in memory, served
 * to viewers as an MJPEG stream) and uploads finished clips, which are stored
 * in Postgres. Meant for trying Pickle Cam out; a real camera with its own
 * storage is better for daily use.
 */

export const MAX_FRAME_BYTES = 600 * 1024;
export const MAX_CLIP_BYTES = 150 * 1024 * 1024;

type Frame = { bytes: Uint8Array; at: number };
type Store = { frames: Map<string, Frame>; seen: Map<string, number> };

// Survives hot reloads; one app instance is assumed (Railway's default).
const g = globalThis as unknown as { __ezpPhoneCam?: Store };
const store: Store = (g.__ezpPhoneCam ??= { frames: new Map(), seen: new Map() });

export function phoneLivePath(cameraId: string) {
  return `/api/cam/live/${cameraId}/mjpeg`;
}

export function recordingVideoPath(recordingId: string) {
  return `/api/cam/recordings/${recordingId}/video`;
}

export function latestFrame(cameraId: string): Frame | null {
  const frame = store.frames.get(cameraId);
  // A frame older than 15 seconds means the phone stopped sending.
  return frame && Date.now() - frame.at < 15_000 ? frame : null;
}

export async function saveFrame(cameraId: string, bytes: Uint8Array) {
  const now = Date.now();
  store.frames.set(cameraId, { bytes, at: now });

  // Touch the database at most every 20 seconds, not on every frame.
  if (now - (store.seen.get(cameraId) ?? 0) > 20_000) {
    store.seen.set(cameraId, now);
    await prisma.courtCamera.update({
      where: { id: cameraId },
      data: { lastSeenAt: new Date(now), liveUrl: phoneLivePath(cameraId), liveType: "MJPEG" },
    });
  }
}

export function clearFrames(cameraId: string) {
  store.frames.delete(cameraId);
  store.seen.delete(cameraId);
}
