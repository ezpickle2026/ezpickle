import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/guard";
import { assertCsrf } from "@/lib/auth";
import { checkinSchema } from "@/lib/validation";
import { route, ok, readJson } from "@/lib/api";
import { verifyBookingToken } from "@/lib/qr";
import { audit } from "@/lib/audit";
import { AppError } from "@/lib/errors";

/**
 * QR check-in. The scanned token is only a lookup hint — the authoritative
 * state always comes from the database row.
 */
export const POST = route(async (request: Request) => {
  await assertCsrf(request);
  const staff = await requirePermission("checkin:write");
  const { token } = checkinSchema.parse(await readJson(request));

  const parsed = verifyBookingToken(token.trim());

  // Fall back to a plain reference typed at the desk when a camera fails.
  const booking = parsed
    ? await prisma.booking.findUnique({
        where: { id: parsed.bookingId },
        include: {
          court: true,
          customer: { select: { fullName: true, email: true, mobile: true } },
          payments: { select: { status: true, amount: true, method: true } },
        },
      })
    : await prisma.booking.findUnique({
        where: { reference: token.trim().toUpperCase() },
        include: {
          court: true,
          customer: { select: { fullName: true, email: true, mobile: true } },
          payments: { select: { status: true, amount: true, method: true } },
        },
      });

  if (!booking) throw new AppError("Invalid booking code.", 404, "invalid_booking");
  if (parsed && booking.reference !== parsed.reference) {
    throw new AppError("Invalid booking code.", 400, "token_mismatch");
  }

  const paid = booking.payments.some((p) => p.status === "PAID");

  if (booking.status === "CANCELLED" || booking.status === "REFUNDED") {
    throw new AppError("This booking was cancelled.", 409, "booking_cancelled");
  }
  if (booking.status === "CHECKED_IN") {
    return ok({ booking, alreadyCheckedIn: true, paid, checkedInAt: booking.checkedInAt });
  }
  if (!paid) {
    throw new AppError(
      "This booking has not been paid. Collect payment before checking in.",
      402,
      "unpaid",
    );
  }

  // Generous window: 60 minutes early, up to the end of the slot.
  const now = Date.now();
  if (now < booking.startAt.getTime() - 60 * 60_000) {
    throw new AppError("This booking is not for today's time slot yet.", 409, "too_early");
  }
  if (now > booking.endAt.getTime()) {
    throw new AppError("This booking has already ended.", 409, "expired_slot");
  }

  const updated = await prisma.booking.update({
    where: { id: booking.id },
    data: { status: "CHECKED_IN", checkedInAt: new Date(), checkedInById: staff.id },
    include: { court: true, customer: { select: { fullName: true, email: true, mobile: true } } },
  });

  await audit({
    userId: staff.id,
    actorEmail: staff.email,
    action: "booking.checkin",
    entity: "Booking",
    entityId: booking.id,
    after: { checkedInAt: updated.checkedInAt },
  });

  return ok({ booking: updated, checkedIn: true, paid: true });
});
