import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/guard";
import { assertCsrf } from "@/lib/auth";
import { route, ok } from "@/lib/api";
import { AppError, Errors } from "@/lib/errors";
import { bestBookingFor } from "@/lib/picklecam";
import { MAX_CLIP_BYTES, recordingVideoPath } from "@/lib/phonecam";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fields = z
  .object({ startAt: z.coerce.date(), endAt: z.coerce.date() })
  .refine((d) => d.endAt > d.startAt, { message: "End must be after start", path: ["endAt"] });

/** A finished clip recorded by the phone camera page. */
export const POST = route(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  await assertCsrf(request);
  await requirePermission("cam:write");
  const { id } = await ctx.params;

  const camera = await prisma.courtCamera.findUnique({ where: { id } });
  if (!camera || !camera.active) throw Errors.notFound("That camera");

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof Blob) || file.size === 0) throw new AppError("No video received.", 400, "bad_request");
  if (file.size > MAX_CLIP_BYTES) throw new AppError("Clip is too large. Use shorter clips.", 413, "too_large");
  const mimeType = file.type.split(";")[0] || "video/mp4";
  if (!/^video\/(mp4|webm|quicktime)$/.test(mimeType)) {
    throw new AppError("Unsupported video format.", 415, "unsupported");
  }
  const { startAt, endAt } = fields.parse({ startAt: form.get("startAt"), endAt: form.get("endAt") });

  const stored = await prisma.uploadedFile.create({
    data: { mimeType, size: file.size, data: Buffer.from(await file.arrayBuffer()) },
    select: { id: true },
  });

  const recording = await prisma.courtRecording.create({
    data: {
      courtId: camera.courtId,
      cameraId: camera.id,
      externalId: `phone-${startAt.getTime()}`,
      startAt,
      endAt,
      status: "READY",
      videoType: "MP4",
      sizeBytes: file.size,
      fileId: stored.id,
      bookingId: await bestBookingFor(camera.courtId, startAt, endAt),
    },
  });
  await prisma.courtRecording.update({
    where: { id: recording.id },
    data: { videoUrl: recordingVideoPath(recording.id) },
  });
  await prisma.courtCamera.update({ where: { id: camera.id }, data: { lastSeenAt: new Date() } });

  return ok({ recording: { id: recording.id, bookingId: recording.bookingId } }, { status: 201 });
});
