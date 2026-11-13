import { z } from "zod";
import { fromZonedTime } from "date-fns-tz";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/guard";
import { assertCsrf } from "@/lib/auth";
import { recordingSchema } from "@/lib/validation";
import { route, ok, readJson } from "@/lib/api";
import { audit } from "@/lib/audit";
import { Errors } from "@/lib/errors";
import { bestBookingFor } from "@/lib/picklecam";

export const dynamic = "force-dynamic";

const query = z.object({
  courtId: z.string().optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const GET = route(async (request: Request) => {
  await requirePermission("cam:read");
  const params = query.parse(Object.fromEntries(new URL(request.url).searchParams));

  let range = {};
  if (params.date) {
    const start = fromZonedTime(`${params.date}T00:00:00`, "Asia/Manila");
    range = { startAt: { gte: start, lt: new Date(start.getTime() + 864e5) } };
  }

  const recordings = await prisma.courtRecording.findMany({
    where: { ...(params.courtId ? { courtId: params.courtId } : {}), ...range },
    orderBy: { startAt: "desc" },
    take: 200,
    include: {
      court: { select: { name: true, number: true } },
      camera: { select: { name: true } },
      booking: {
        select: { reference: true, customer: { select: { fullName: true } } },
      },
    },
  });
  return ok({ recordings });
});

/** Adds a recording by link, for cameras that can't call the ingest API. */
export const POST = route(async (request: Request) => {
  await assertCsrf(request);
  const user = await requirePermission("cam:write");
  const input = recordingSchema.parse(await readJson(request));

  const court = await prisma.court.findFirst({ where: { id: input.courtId, deletedAt: null } });
  if (!court) throw Errors.notFound("That court");

  const recording = await prisma.courtRecording.create({
    data: {
      ...input,
      title: input.title || null,
      thumbnailUrl: input.thumbnailUrl ?? null,
      status: "READY",
      bookingId: await bestBookingFor(input.courtId, input.startAt, input.endAt),
    },
  });

  await audit({
    userId: user.id,
    actorEmail: user.email,
    action: "recording.create",
    entity: "CourtRecording",
    entityId: recording.id,
    after: { courtId: recording.courtId, startAt: recording.startAt, endAt: recording.endAt },
  });
  return ok({ recording }, { status: 201 });
});
