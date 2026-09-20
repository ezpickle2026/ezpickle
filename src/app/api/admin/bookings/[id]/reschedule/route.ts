import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/guard";
import { assertCsrf } from "@/lib/auth";
import { rescheduleSchema } from "@/lib/validation";
import { route, ok, readJson } from "@/lib/api";
import { manilaDateTimeToUtc } from "@/lib/time";
import { OCCUPYING } from "@/lib/booking";
import { Errors, AppError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { publish } from "@/lib/realtime";
import { formatManila } from "@/lib/time";

/**
 * Moving a booking runs through the same locking and exclusion-constraint path
 * as creating one — an admin cannot drag a booking on top of another.
 */
export const POST = route(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  await assertCsrf(request);
  const { id } = await ctx.params;
  const staff = await requirePermission("booking:write");
  const input = rescheduleSchema.parse(await readJson(request));

  const startAt = manilaDateTimeToUtc(input.date, input.startMin);
  const endAt = new Date(startAt.getTime() + input.durationMins * 60_000);

  const updated = await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.courtId}))`;

      const booking = await tx.booking.findUnique({ where: { id } });
      if (!booking) throw Errors.notFound("That booking");
      if (["CANCELLED", "REFUNDED", "COMPLETED"].includes(booking.status)) {
        throw new AppError("Closed bookings cannot be moved.", 409, "not_reschedulable");
      }

      const clash = await tx.booking.findFirst({
        where: {
          id: { not: id },
          courtId: input.courtId,
          status: { in: OCCUPYING },
          startAt: { lt: endAt },
          endAt: { gt: startAt },
        },
      });
      if (clash) throw Errors.slotTaken();

      const blocked = await tx.courtBlock.findFirst({
        where: { courtId: input.courtId, startAt: { lt: endAt }, endAt: { gt: startAt } },
      });
      if (blocked) throw new AppError("That court is blocked at that time.", 409, "blocked");

      return tx.booking.update({
        where: { id },
        data: { courtId: input.courtId, startAt, endAt, durationMins: input.durationMins },
        include: { court: true, customer: true },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  await audit({
    userId: staff.id,
    actorEmail: staff.email,
    action: "booking.reschedule",
    entity: "Booking",
    entityId: id,
    after: { courtId: input.courtId, startAt, endAt },
  });

  await notify({
    userId: updated.customerId,
    to: updated.customer.email,
    template: "booking_rescheduled",
    payload: {
      reference: updated.reference,
      court: updated.court.name,
      newTime: formatManila(updated.startAt),
    },
  });

  await publish("availability", { type: "slot_changed", courtId: input.courtId, date: input.date });

  return ok({ booking: updated });
});
