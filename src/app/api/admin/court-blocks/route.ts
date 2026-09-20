import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/guard";
import { assertCsrf } from "@/lib/auth";
import { courtBlockSchema } from "@/lib/validation";
import { route, ok, readJson } from "@/lib/api";
import { manilaDateTimeToUtc } from "@/lib/time";
import { audit } from "@/lib/audit";
import { publish } from "@/lib/realtime";
import { AppError } from "@/lib/errors";
import { OCCUPYING } from "@/lib/booking";
import { z } from "zod";

export const POST = route(async (request: Request) => {
  await assertCsrf(request);
  const user = await requirePermission("court:write");
  const input = courtBlockSchema.parse(await readJson(request));

  const startAt = manilaDateTimeToUtc(input.date, input.startMin);
  const endAt = manilaDateTimeToUtc(input.date, input.endMin);
  if (endAt <= startAt) throw new AppError("End time must be after the start time.", 400, "bad_range");

  const conflict = await prisma.booking.findFirst({
    where: {
      courtId: input.courtId,
      status: { in: OCCUPYING },
      startAt: { lt: endAt },
      endAt: { gt: startAt },
    },
    include: { customer: { select: { fullName: true } } },
  });
  if (conflict) {
    throw new AppError(
      `There is already a booking on this court (${conflict.reference}, ${conflict.customer.fullName}). Cancel or move it first.`,
      409,
      "block_conflicts",
    );
  }

  const block = await prisma.courtBlock.create({
    data: {
      courtId: input.courtId,
      startAt,
      endAt,
      reason: input.reason,
      note: input.note ?? null,
    },
  });

  await audit({
    userId: user.id,
    actorEmail: user.email,
    action: "court.block",
    entity: "CourtBlock",
    entityId: block.id,
    after: block,
  });
  await publish("availability", {
    type: "slot_changed",
    courtId: input.courtId,
    date: input.date,
    state: "BLOCKED",
  });

  return ok({ block }, { status: 201 });
});

export const DELETE = route(async (request: Request) => {
  await assertCsrf(request);
  const user = await requirePermission("court:write");
  const { id } = z.object({ id: z.string().min(1) }).parse(await readJson(request));

  const block = await prisma.courtBlock.delete({ where: { id } });

  await audit({
    userId: user.id,
    actorEmail: user.email,
    action: "court.unblock",
    entity: "CourtBlock",
    entityId: id,
    before: block,
  });
  await publish("availability", {
    type: "slot_changed",
    courtId: block.courtId,
    date: block.startAt.toISOString().slice(0, 10),
    state: "AVAILABLE",
  });

  return ok({ removed: true });
});
