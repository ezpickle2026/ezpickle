import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, assertCsrf } from "@/lib/auth";
import { route, ok, readJson } from "@/lib/api";
import { AppError, Errors } from "@/lib/errors";
import { createCheckoutSession } from "@/lib/paymongo";
import { env } from "@/lib/env";
import { reference as makeReference } from "@/lib/reference";
import { rateLimit } from "@/lib/rate-limit";
import { formatManila } from "@/lib/time";

const schema = z.object({
  bookingId: z.string().min(1).optional(),
  openPlayPlayerId: z.string().min(1).optional(),
});

/**
 * Starts a PayMongo hosted checkout for a held booking or Open Play seat.
 *
 * Nothing here marks anything as paid. The returned URL simply sends the
 * customer to PayMongo; the booking only becomes CONFIRMED when the signed
 * `checkout_session.payment.paid` webhook arrives.
 */
export const POST = route(async (request: Request) => {
  await assertCsrf(request);
  const user = await requireUser();
  await rateLimit(`checkout:${user.id}`, 20, 600);

  const input = schema.parse(await readJson(request));
  if (!input.bookingId && !input.openPlayPlayerId) {
    throw new AppError("Nothing to pay for.", 400, "missing_target");
  }

  const customer = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });

  if (input.bookingId) {
    const booking = await prisma.booking.findUnique({
      where: { id: input.bookingId },
      include: { court: true, payments: true },
    });
    if (!booking) throw Errors.notFound("That booking");
    if (booking.customerId !== user.id) throw Errors.forbidden();
    if (booking.status === "CONFIRMED") {
      return ok({ alreadyPaid: true, bookingId: booking.id });
    }
    if (booking.status !== "PAYMENT_PENDING") throw Errors.holdExpired();
    if (booking.holdExpiresAt && booking.holdExpiresAt < new Date()) throw Errors.holdExpired();

    // Reuse an outstanding session rather than opening a second one.
    const live = booking.payments.find((p) => p.status === "AWAITING" && p.checkoutUrl);
    if (live?.checkoutUrl) {
      return ok({ checkoutUrl: live.checkoutUrl, paymentId: live.id, reused: true });
    }

    const referenceNumber = makeReference("PAY", 8);
    const session = await createCheckoutSession({
      referenceNumber,
      description: `EzPickle — ${booking.court.name}, ${formatManila(booking.startAt)}`,
      lineItems: [
        {
          name: `${booking.court.name} · ${booking.durationMins / 60}h`,
          amount: booking.total,
          quantity: 1,
          description: formatManila(booking.startAt, "EEE d MMM yyyy, h:mm a"),
        },
      ],
      successUrl: `${env.APP_URL}/booking/${booking.reference}/confirmation`,
      cancelUrl: `${env.APP_URL}/book?cancelled=${booking.reference}`,
      billing: { name: customer.fullName, email: customer.email, phone: customer.mobile },
      metadata: { bookingId: booking.id, bookingRef: booking.reference, kind: "court_booking" },
      // Same booking + same amount => same key => PayMongo returns the
      // original session instead of creating a duplicate.
      idempotencyKey: `booking:${booking.id}:${booking.total}`,
    });

    const payment = await prisma.payment.create({
      data: {
        purpose: "COURT_BOOKING",
        bookingId: booking.id,
        amount: booking.total,
        status: "AWAITING",
        checkoutSessionId: session.id,
        checkoutUrl: session.checkoutUrl,
        paymentIntentId: session.paymentIntentId,
        referenceNumber,
      },
    });

    return ok({ checkoutUrl: session.checkoutUrl, paymentId: payment.id });
  }

  // ---- Open Play seat ----
  const player = await prisma.openPlayPlayer.findUnique({
    where: { id: input.openPlayPlayerId! },
    include: { session: true, payment: true },
  });
  if (!player) throw Errors.notFound("That registration");
  if (player.userId !== user.id) throw Errors.forbidden();
  if (player.status === "REGISTERED") return ok({ alreadyPaid: true });
  if (player.status !== "PENDING_PAYMENT") throw Errors.holdExpired();
  if (player.holdExpiresAt && player.holdExpiresAt < new Date()) throw Errors.holdExpired();

  if (player.payment?.status === "AWAITING" && player.payment.checkoutUrl) {
    return ok({ checkoutUrl: player.payment.checkoutUrl, paymentId: player.payment.id, reused: true });
  }

  const referenceNumber = makeReference("PAY", 8);
  const session = await createCheckoutSession({
    referenceNumber,
    description: `EzPickle Open Play — ${player.session.title}`,
    lineItems: [
      {
        name: `Open Play · ${player.session.title}`,
        amount: player.session.pricePerPlayer,
        quantity: 1,
        description: formatManila(player.session.startAt, "EEE d MMM yyyy, h:mm a"),
      },
    ],
    successUrl: `${env.APP_URL}/open-play/${player.sessionId}?joined=1`,
    cancelUrl: `${env.APP_URL}/open-play/${player.sessionId}`,
    billing: { name: customer.fullName, email: customer.email, phone: customer.mobile },
    metadata: { openPlayPlayerId: player.id, sessionId: player.sessionId, kind: "open_play" },
    idempotencyKey: `openplay:${player.id}:${player.session.pricePerPlayer}`,
  });

  const payment = await prisma.payment.create({
    data: {
      purpose: "OPEN_PLAY",
      openPlayPlayerId: player.id,
      amount: player.session.pricePerPlayer,
      status: "AWAITING",
      checkoutSessionId: session.id,
      checkoutUrl: session.checkoutUrl,
      paymentIntentId: session.paymentIntentId,
      referenceNumber,
    },
  });

  return ok({ checkoutUrl: session.checkoutUrl, paymentId: payment.id });
});
