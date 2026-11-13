import { prisma } from "@/lib/prisma";
import { route, ok, readJson } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { camIngestSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";
import { bestBookingFor, cameraKeyFromRequest, hashCameraKey } from "@/lib/picklecam";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Camera connection endpoint. A camera, NVR or small recording agent at the
 * court authenticates with its own key (Authorization: Bearer ezcam_...) and
 * reports heartbeats and finished clips. Clips are stored as links: the video
 * itself stays on the recorder or the storage it uploads to.
 */
export const POST = route(async (request: Request) => {
  const key = cameraKeyFromRequest(request);
  if (!key) throw new AppError("Missing camera key.", 401, "unauthorized");

  const camera = await prisma.courtCamera.findUnique({ where: { ingestKeyHash: hashCameraKey(key) } });
  if (!camera || !camera.active) throw new AppError("Unknown or disabled camera key.", 401, "unauthorized");

  await rateLimit(`cam:${camera.id}`, 240, 60);

  const input = camIngestSchema.parse(await readJson(request));
  const now = new Date();

  // Any call proves the camera is alive.
  await prisma.courtCamera.update({
    where: { id: camera.id },
    data: {
      lastSeenAt: now,
      ...(input.event === "heartbeat" && input.liveUrl !== undefined ? { liveUrl: input.liveUrl } : {}),
      ...(input.event === "heartbeat" && input.liveType ? { liveType: input.liveType } : {}),
    },
  });

  if (input.event === "heartbeat") return ok({ camera: camera.id, at: now });

  const where = { cameraId_externalId: { cameraId: camera.id, externalId: input.externalId } };

  if (input.event === "recording.started") {
    const recording = await prisma.courtRecording.upsert({
      where,
      create: {
        courtId: camera.courtId,
        cameraId: camera.id,
        externalId: input.externalId,
        startAt: input.startAt ?? now,
        status: "RECORDING",
      },
      update: { status: "RECORDING", ...(input.startAt ? { startAt: input.startAt } : {}) },
    });
    return ok({ recording: { id: recording.id, status: recording.status } });
  }

  if (input.event === "recording.failed") {
    const recording = await prisma.courtRecording.upsert({
      where,
      create: {
        courtId: camera.courtId,
        cameraId: camera.id,
        externalId: input.externalId,
        startAt: now,
        status: "FAILED",
        error: input.error ?? null,
      },
      update: { status: "FAILED", error: input.error ?? null },
    });
    return ok({ recording: { id: recording.id, status: recording.status } });
  }

  // recording.completed
  if (input.endAt <= input.startAt) {
    throw new AppError("endAt must be after startAt.", 422, "validation_error");
  }
  const bookingId = await bestBookingFor(camera.courtId, input.startAt, input.endAt);
  const data = {
    startAt: input.startAt,
    endAt: input.endAt,
    videoUrl: input.videoUrl,
    videoType: input.videoType,
    thumbnailUrl: input.thumbnailUrl ?? null,
    sizeBytes: input.sizeBytes ?? null,
    title: input.title ?? null,
    status: "READY" as const,
    error: null,
    bookingId,
  };
  const recording = await prisma.courtRecording.upsert({
    where,
    create: { courtId: camera.courtId, cameraId: camera.id, externalId: input.externalId, ...data },
    update: data,
  });

  return ok({ recording: { id: recording.id, status: recording.status, bookingId } }, { status: 201 });
});
