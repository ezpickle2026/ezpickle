import "server-only";
import { Prisma, type BookingStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { AppError, Errors } from "./errors";
import { getSettings } from "./settings";
import { priceBooking, applyDiscount } from "./pricing";
import { reference } from "./reference";
import { manilaDateTimeToUtc, manilaStartOfDay, manilaEndOfDay, minutesFromMidnight } from "./time";
import { publish } from "./realtime";

/** Statuses that occupy a court. Mirrors the SQL exclusion constraint exactly. */
export const OCCUPYING: BookingStatus[] = [
  "PENDING",
  "PAYMENT_PENDING",
  "CONFIRMED",
  "CHECKED_IN",
  "COMPLETED",
];

export type SlotState = "AVAILABLE" | "BOOKED" | "HELD" | "BLOCKED" | "CLOSED" | "PAST";

export type CourtAvailability = {
  courtId: string;
  courtName: string;
  courtNumber: number;
  hourlyPrice: number;
  status: string;
  slots: { startMin: number; endMin: number; state: SlotState; price: number }[];
};

/**
 * Availability grid for one Manila calendar day.
 * Read-only and cheap enough to poll; the realtime channel pushes deltas.
 */
export async function getDayAvailability(dateISO: string): Promise<{
  date: string;
  intervalMins: number;
  openingMin: number;
  closingMin: number;
  courts: CourtAvailability[];
}> {
  const settings = await getSettings();
  const dayStart = manilaStartOfDay(dateISO);
  const dayEnd = manilaEndOfDay(dateISO);
  const now = new Date();

  const [courts, bookings, blocks, rules] = await Promise.all([
    prisma.court.findMany({
      where: { active: true, deletedAt: null },
      orderBy: { number: "asc" },
    }),
    prisma.booking.findMany({
      where: {
        startAt: { lt: dayEnd },
        endAt: { gt: dayStart },
        status: { in: OCCUPYING },
      },
      select: { courtId: true, startAt: true, endAt: true, status: true, holdExpiresAt: true },
    }),
    prisma.courtBlock.findMany({
      where: { startAt: { lt: dayEnd }, endAt: { gt: dayStart } },
      select: { courtId: true, startAt: true, endAt: true },
    }),
    prisma.pricingRule.findMany({ where: { active: true, scope: "COURT_HOURLY" } }),
  ]);

  const step = settings.bookingIntervalMins;

  const courtsOut = courts.map((court) => {
    const slots: CourtAvailability["slots"] = [];

    for (let min = settings.openingMin; min + step <= settings.closingMin; min += step) {
      const slotStart = manilaDateTimeToUtc(dateISO, min);
      const slotEnd = manilaDateTimeToUtc(dateISO, min + step);

      let state: SlotState = "AVAILABLE";

      if (slotEnd <= now) {
        state = "PAST";
      } else if (!court.bookable || court.status !== "AVAILABLE") {
        state = "BLOCKED";
      } else if (
        blocks.some((b) => b.courtId === court.id && b.startAt < slotEnd && slotStart < b.endAt)
      ) {
        state = "BLOCKED";
      } else {
        const hit = bookings.find(
          (b) => b.courtId === court.id && b.startAt < slotEnd && slotStart < b.endAt,
        );
        if (hit) {
          const stillHeld =
            hit.status === "PAYMENT_PENDING" &&
            (!hit.holdExpiresAt || hit.holdExpiresAt > now);
          if (hit.status === "PAYMENT_PENDING" && !stillHeld) state = "AVAILABLE";
          else state = hit.status === "PAYMENT_PENDING" ? "HELD" : "BOOKED";
        }
      }

      const { total } = priceBooking({
        start: slotStart,
        end: slotEnd,
        courtId: court.id,
        fallbackHourly: court.hourlyPrice,
        rules,
        stepMins: step,
      });

      slots.push({ startMin: min, endMin: min + step, state, price: total });
    }

    return {
      courtId: court.id,
      courtName: court.name,
      courtNumber: court.number,
      hourlyPrice: court.hourlyPrice,
      status: court.status,
      slots,
    };
  });

  return {
    date: dateISO,
    intervalMins: step,
    openingMin: settings.openingMin,
    closingMin: settings.closingMin,
    courts: courtsOut,
  };
}

/** Quote a booking without committing to it. Used by the booking wizard. */
export async function quote(params: {
  courtId: string;
  dateISO: string;
  startMin: number;
  durationMins: number;
  promoCode?: string | null;
}) {
  const settings = await getSettings();
  const court = await prisma.court.findFirst({
    where: { id: params.courtId, active: true, deletedAt: null },
  });
  if (!court) throw Errors.notFound("That court");

  validateBookingWindow(params.durationMins, settings);

  const start = manilaDateTimeToUtc(params.dateISO, params.startMin);
  const end = new Date(start.getTime() + params.durationMins * 60_000);

  const rules = await prisma.pricingRule.findMany({
    where: { active: true, scope: "COURT_HOURLY" },
  });
  const { total: subtotal, breakdown } = priceBooking({
    start,
    end,
    courtId: court.id,
    fallbackHourly: court.hourlyPrice,
    rules,
    stepMins: settings.bookingIntervalMins,
  });

  const promo = params.promoCode ? await findValidPromo(params.promoCode, court.id, subtotal) : null;
  const discount = applyDiscount(subtotal, promo);

  return {
    courtId: court.id,
    courtName: court.name,
    start,
    end,
    durationMins: params.durationMins,
    subtotal,
    discount,
    total: subtotal - discount,
    promoId: promo?.id ?? null,
    promoCode: promo?.code ?? null,
    breakdown,
  };
}

/**
 * Creates a held booking.
 *
 * Three layers of protection, in order:
 *  1. SERIALIZABLE transaction — concurrent conflicting txs get aborted by PG.
 *  2. An explicit advisory lock per court — serialises the read-then-write gap.
 *  3. The `booking_no_overlap` GiST exclusion constraint — the final authority.
 *
 * Even if the application logic were completely removed, layer 3 alone makes a
 * double booking impossible.
 */
export async function createHeldBooking(params: {
  courtId: string;
  customerId: string;
  dateISO: string;
  startMin: number;
  durationMins: number;
  promoCode?: string | null;
  notes?: string | null;
  createdById?: string | null;
  source?: "ONLINE" | "WALK_IN" | "ADMIN";
  skipHold?: boolean;
}) {
  const settings = await getSettings();
  validateBookingWindow(params.durationMins, settings);

  const start = manilaDateTimeToUtc(params.dateISO, params.startMin);
  const end = new Date(start.getTime() + params.durationMins * 60_000);
  const now = new Date();

  if (end <= now) throw new AppError("That time has already passed.", 400, "past_slot");

  const maxAdvance = new Date(now.getTime() + settings.maxAdvanceDays * 864e5);
  if (start > maxAdvance && params.source === "ONLINE") {
    throw new AppError(
      `Bookings can only be made up to ${settings.maxAdvanceDays} days in advance.`,
      400,
      "too_far_ahead",
    );
  }

  const startMinOfDay = minutesFromMidnight(start);
  const endMinOfDay = startMinOfDay + params.durationMins;
  if (startMinOfDay < settings.openingMin || endMinOfDay > settings.closingMin) {
    throw new AppError("That time is outside our opening hours.", 400, "outside_hours");
  }

  const booking = await prisma.$transaction(
    async (tx) => {
      // (2) Serialise all bookers competing for the same court.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${params.courtId}))`;

      const court = await tx.court.findFirst({
        where: { id: params.courtId, active: true, deletedAt: null },
      });
      if (!court) throw Errors.notFound("That court");
      if (!court.bookable || court.status !== "AVAILABLE") {
        throw new AppError("That court is not available for booking.", 409, "court_unavailable");
      }

      // Reclaim stale holds so an abandoned checkout does not block the slot.
      await tx.booking.updateMany({
        where: {
          courtId: court.id,
          status: "PAYMENT_PENDING",
          holdExpiresAt: { lt: now },
        },
        data: { status: "EXPIRED" },
      });

      const bufferStart = new Date(start.getTime() - settings.bufferMins * 60_000);
      const bufferEnd = new Date(end.getTime() + settings.bufferMins * 60_000);

      const blocked = await tx.courtBlock.findFirst({
        where: { courtId: court.id, startAt: { lt: bufferEnd }, endAt: { gt: bufferStart } },
      });
      if (blocked) {
        throw new AppError("That court is blocked for maintenance at that time.", 409, "blocked");
      }

      const clash = await tx.booking.findFirst({
        where: {
          courtId: court.id,
          status: { in: OCCUPYING },
          startAt: { lt: bufferEnd },
          endAt: { gt: bufferStart },
        },
      });
      if (clash) throw Errors.slotTaken();

      const rules = await tx.pricingRule.findMany({
        where: { active: true, scope: "COURT_HOURLY" },
      });
      const { total: subtotal } = priceBooking({
        start,
        end,
        courtId: court.id,
        fallbackHourly: court.hourlyPrice,
        rules,
        stepMins: settings.bookingIntervalMins,
      });

      let promoId: string | null = null;
      let discount = 0;
      if (params.promoCode) {
        const promo = await findValidPromo(params.promoCode, court.id, subtotal, tx);
        if (promo) {
          promoId = promo.id;
          discount = applyDiscount(subtotal, promo);
          await tx.promoCode.update({
            where: { id: promo.id },
            data: { usageCount: { increment: 1 } },
          });
        }
      }

      // (3) The insert either satisfies booking_no_overlap or the whole
      //     transaction dies. There is no third outcome.
      return tx.booking.create({
        data: {
          reference: reference("EZP"),
          courtId: court.id,
          customerId: params.customerId,
          createdById: params.createdById ?? null,
          startAt: start,
          endAt: end,
          durationMins: params.durationMins,
          subtotal,
          discount,
          total: subtotal - discount,
          status: params.skipHold ? "CONFIRMED" : "PAYMENT_PENDING",
          source: params.source ?? "ONLINE",
          holdExpiresAt: params.skipHold
            ? null
            : new Date(now.getTime() + settings.holdMinutes * 60_000),
          promoCodeId: promoId,
          notes: params.notes ?? null,
        },
        include: { court: true, customer: { select: { fullName: true, email: true } } },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 },
  );

  await publish("availability", {
    type: "slot_changed",
    courtId: booking.courtId,
    date: params.dateISO,
    state: params.skipHold ? "BOOKED" : "HELD",
  });

  return booking;
}

export async function cancelBooking(params: {
  bookingId: string;
  actorId: string;
  isStaff: boolean;
  reason?: string;
}) {
  const settings = await getSettings();

  const booking = await prisma.booking.findUnique({ where: { id: params.bookingId } });
  if (!booking) throw Errors.notFound("That booking");

  if (!params.isStaff && booking.customerId !== params.actorId) throw Errors.forbidden();

  if (["CANCELLED", "COMPLETED", "REFUNDED", "NO_SHOW"].includes(booking.status)) {
    throw new AppError("This booking can no longer be cancelled.", 409, "not_cancellable");
  }

  if (!params.isStaff) {
    const noticeMins = (booking.startAt.getTime() - Date.now()) / 60_000;
    if (noticeMins < settings.minCancelNoticeMins) {
      throw new AppError(
        `Cancellations require at least ${Math.round(
          settings.minCancelNoticeMins / 60,
        )} hours notice. Please contact the facility.`,
        409,
        "late_cancellation",
      );
    }
  }

  const updated = await prisma.booking.update({
    where: { id: booking.id },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelReason: params.reason ?? (params.isStaff ? "Cancelled by staff" : "Cancelled by customer"),
    },
    include: { court: true },
  });

  await publish("availability", {
    type: "slot_changed",
    courtId: updated.courtId,
    date: updated.startAt.toISOString().slice(0, 10),
    state: "AVAILABLE",
  });

  return updated;
}

function validateBookingWindow(
  durationMins: number,
  settings: { minBookingMins: number; maxBookingMins: number; bookingIntervalMins: number },
) {
  if (durationMins < settings.minBookingMins) {
    throw new AppError(
      `Minimum booking is ${settings.minBookingMins} minutes.`,
      400,
      "duration_too_short",
    );
  }
  if (durationMins > settings.maxBookingMins) {
    throw new AppError(
      `Maximum booking is ${settings.maxBookingMins / 60} hours.`,
      400,
      "duration_too_long",
    );
  }
  if (durationMins % settings.bookingIntervalMins !== 0) {
    throw new AppError(
      `Bookings must be in ${settings.bookingIntervalMins}-minute blocks.`,
      400,
      "bad_interval",
    );
  }
}

export async function findValidPromo(
  code: string,
  courtId: string,
  subtotal: number,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const promo = await tx.promoCode.findUnique({ where: { code: code.trim().toUpperCase() } });
  if (!promo || !promo.active) return null;

  const now = new Date();
  if (promo.startsAt && promo.startsAt > now) return null;
  if (promo.endsAt && promo.endsAt < now) return null;
  if (promo.usageLimit !== null && promo.usageCount >= promo.usageLimit) return null;
  if (promo.courtIds.length > 0 && !promo.courtIds.includes(courtId)) return null;
  if (subtotal < promo.minPurchase) return null;

  return promo;
}
