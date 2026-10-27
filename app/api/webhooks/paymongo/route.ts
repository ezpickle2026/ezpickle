import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyWebhookSignature } from "@/lib/paymongo";
import { env } from "@/lib/env";
import { notify } from "@/lib/notifications";
import { publish } from "@/lib/realtime";
import { promoteWaitlist } from "@/lib/openplay";
import { reference as makeReference } from "@/lib/reference";
import { formatManila } from "@/lib/time";
import { peso } from "@/lib/utils";

// Node runtime: we need the raw body bytes and node:crypto for the HMAC.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type WebhookEnvelope = {
  data?: {
    id?: string;
    type?: string;
    livemode?: boolean;
    attributes?: {
      type?: string;
      livemode?: boolean;
      data?: unknown;
    };
    data?: {
      id?: string;
      attributes?: {
        reference_number?: string;
        metadata?: Record<string, string>;
        payment_intent?: { id?: string };
        payments?: {
          id?: string;
          attributes?: {
            status?: string;
            amount?: number;
            fee?: number;
            net_amount?: number;
            source?: { type?: string };
            last_payment_error?: unknown;
          };
        }[];
      };
    };
  };
};

const FULFILLABLE = new Set([
  "checkout_session.payment.paid",
  "payment.paid",
  "link.payment.paid",
]);

const FAILURE = new Set(["payment.failed", "checkout_session.payment.failed"]);

export async function POST(request: Request) {
  // 1. Raw body first. Parsing before verifying would change the bytes and
  //    break the signature.
  const rawBody = await request.text();
  const signature = request.headers.get("paymongo-signature");

  const verification = verifyWebhookSignature({ rawBody, signatureHeader: signature });
  if (!verification.valid) {
    console.warn("[paymongo-webhook] rejected:", verification.reason);
    // 401 without detail — never tell a forger why it failed.
    return NextResponse.json({ received: false }, { status: 401 });
  }

  let envelope: WebhookEnvelope;
  try {
    envelope = JSON.parse(rawBody) as WebhookEnvelope;
  } catch {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const eventId = envelope.data?.id ?? `unknown-${Date.now()}`;
  const eventType = envelope.data?.type ?? envelope.data?.attributes?.type ?? "unknown";
  const livemode = envelope.data?.livemode ?? envelope.data?.attributes?.livemode ?? false;

  // 2. Dedupe. PayMongo retries up to 12 times; the unique index makes a
  //    replay a no-op rather than a double fulfilment.
  try {
    await prisma.webhookEvent.create({
      data: { provider: "paymongo", eventId, type: eventType, livemode, payload: envelope as never },
    });
  } catch {
    return NextResponse.json({ received: true, duplicate: true }, { status: 200 });
  }

  // 3. Environment guard: a test event must never touch live bookings.
  if (livemode !== env.PAYMONGO_LIVEMODE) {
    await prisma.webhookEvent.updateMany({
      where: { provider: "paymongo", eventId },
      data: { processedAt: new Date(), error: "ignored: livemode mismatch" },
    });
    return NextResponse.json({ received: true, ignored: "livemode" }, { status: 200 });
  }

  // 4. Unknown event types are acknowledged, never rejected — a 4xx would put
  //    them into PayMongo's retry queue forever.
  if (!FULFILLABLE.has(eventType) && !FAILURE.has(eventType)) {
    await prisma.webhookEvent.updateMany({
      where: { provider: "paymongo", eventId },
      data: { processedAt: new Date() },
    });
    return NextResponse.json({ received: true, ignored: eventType }, { status: 200 });
  }

  try {
    if (FULFILLABLE.has(eventType)) await fulfil(envelope);
    else await markFailed(envelope);

    await prisma.webhookEvent.updateMany({
      where: { provider: "paymongo", eventId },
      data: { processedAt: new Date() },
    });
  } catch (error) {
    console.error("[paymongo-webhook] processing failed", error);
    await prisma.webhookEvent.updateMany({
      where: { provider: "paymongo", eventId },
      data: { error: String(error).slice(0, 1000) },
    });
    // 500 asks PayMongo to retry; the dedupe row is cleared so the retry can
    // be reprocessed.
    await prisma.webhookEvent.deleteMany({ where: { provider: "paymongo", eventId } });
    return NextResponse.json({ received: false }, { status: 500 });
  }

  return NextResponse.json({ received: true }, { status: 200 });
}

function extract(envelope: WebhookEnvelope) {
  const resource = envelope.data?.data;
  const attributes = resource?.attributes;
  const payment = attributes?.payments?.[0];

  return {
    checkoutSessionId: resource?.id ?? null,
    referenceNumber: attributes?.reference_number ?? null,
    metadata: attributes?.metadata ?? {},
    paymentIntentId: attributes?.payment_intent?.id ?? null,
    paymentId: payment?.id ?? null,
    amount: payment?.attributes?.amount ?? null,
    fee: payment?.attributes?.fee ?? null,
    netAmount: payment?.attributes?.net_amount ?? null,
    method: payment?.attributes?.source?.type ?? null,
    status: payment?.attributes?.status ?? null,
  };
}

/** Credits the booking / Open Play seat. Idempotent at every step. */
async function fulfil(envelope: WebhookEnvelope) {
  const info = extract(envelope);

  const payment = await findPayment(info);
  if (!payment) {
    console.warn("[paymongo-webhook] no local payment matched", info.checkoutSessionId);
    return;
  }
  if (payment.status === "PAID") return; // already credited

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "PAID",
        paidAt: new Date(),
        paymentId: info.paymentId,
        paymentIntentId: info.paymentIntentId ?? payment.paymentIntentId,
        method: info.method,
        feeAmount: info.fee,
        netAmount: info.netAmount,
        rawPayload: envelope as never,
      },
    });

    if (payment.bookingId) {
      const booking = await tx.booking.update({
        where: { id: payment.bookingId },
        // Clearing holdExpiresAt takes the booking out of the sweeper's reach.
        data: { status: "CONFIRMED", holdExpiresAt: null },
        include: { court: true, customer: true },
      });

      await tx.sale.upsert({
        where: { bookingId: booking.id },
        create: {
          reference: makeReference("SL", 8),
          channel: "COURT_BOOKING",
          customerId: booking.customerId,
          bookingId: booking.id,
          subtotal: booking.subtotal,
          discount: booking.discount,
          total: booking.total,
          paymentMethod: info.method ?? "paymongo",
          items: {
            create: {
              description: `${booking.court.name} · ${booking.durationMins / 60}h`,
              quantity: 1,
              unitPrice: booking.subtotal,
              total: booking.subtotal,
            },
          },
        },
        update: {},
      });
    }

    if (payment.openPlayPlayerId) {
      const player = await tx.openPlayPlayer.update({
        where: { id: payment.openPlayPlayerId },
        data: { status: "REGISTERED", holdExpiresAt: null },
        include: { session: true },
      });

      await tx.waitlist.updateMany({
        where: { sessionId: player.sessionId, userId: player.userId },
        data: { status: "ACCEPTED" },
      });

      await tx.sale.create({
        data: {
          reference: makeReference("SL", 8),
          channel: "OPEN_PLAY",
          customerId: player.userId,
          subtotal: player.session.pricePerPlayer,
          total: player.session.pricePerPlayer,
          paymentMethod: info.method ?? "paymongo",
          items: {
            create: {
              description: `Open Play · ${player.session.title}`,
              quantity: 1,
              unitPrice: player.session.pricePerPlayer,
              total: player.session.pricePerPlayer,
            },
          },
        },
      });
    }
  });

  // Notifications and realtime happen after the transaction commits so a slow
  // mail provider can never hold a database lock open.
  if (payment.bookingId) {
    const booking = await prisma.booking.findUnique({
      where: { id: payment.bookingId },
      include: { court: true, customer: true },
    });
    if (booking) {
      await notify({
        userId: booking.customerId,
        to: booking.customer.email,
        template: "booking_confirmed",
        payload: {
          reference: booking.reference,
          court: booking.court.name,
          when: formatManila(booking.startAt),
          amountPaid: peso(booking.total),
          paymentReference: payment.referenceNumber,
        },
      });
      await publish("availability", {
        type: "slot_changed",
        courtId: booking.courtId,
        date: booking.startAt.toISOString().slice(0, 10),
        state: "BOOKED",
      });
    }
  }

  if (payment.openPlayPlayerId) {
    const player = await prisma.openPlayPlayer.findUnique({
      where: { id: payment.openPlayPlayerId },
      include: { session: true, user: true },
    });
    if (player) {
      await notify({
        userId: player.userId,
        to: player.user.email,
        template: "openplay_registered",
        payload: {
          session: player.session.title,
          when: formatManila(player.session.startAt),
          amountPaid: peso(player.session.pricePerPlayer),
        },
      });
      await publish("openplay", { type: "roster_changed", sessionId: player.sessionId });
    }
  }
}

async function markFailed(envelope: WebhookEnvelope) {
  const info = extract(envelope);
  const payment = await findPayment(info);
  if (!payment || payment.status === "PAID") return;

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: "FAILED",
      failureReason: "Payment was declined or cancelled at the provider.",
      rawPayload: envelope as never,
    },
  });

  if (payment.bookingId) {
    const booking = await prisma.booking.findUnique({
      where: { id: payment.bookingId },
      include: { customer: true, court: true },
    });
    // The hold is left to lapse naturally — the customer may retry with
    // another method before it expires.
    if (booking && booking.status === "PAYMENT_PENDING") {
      await notify({
        userId: booking.customerId,
        to: booking.customer.email,
        template: "payment_failed",
        payload: {
          reference: booking.reference,
          court: booking.court.name,
          retryUrl: `/booking/${booking.reference}/pay`,
        },
      });
    }
  }

  if (payment.openPlayPlayerId) {
    const player = await prisma.openPlayPlayer.findUnique({
      where: { id: payment.openPlayPlayerId },
    });
    if (player) await promoteWaitlist(player.sessionId);
  }
}

async function findPayment(info: ReturnType<typeof extract>) {
  if (info.checkoutSessionId) {
    const bySession = await prisma.payment.findUnique({
      where: { checkoutSessionId: info.checkoutSessionId },
    });
    if (bySession) return bySession;
  }
  if (info.referenceNumber) {
    const byRef = await prisma.payment.findUnique({
      where: { referenceNumber: info.referenceNumber },
    });
    if (byRef) return byRef;
  }
  const bookingId = info.metadata?.bookingId;
  if (bookingId) {
    return prisma.payment.findFirst({
      where: { bookingId, status: { in: ["AWAITING", "FAILED"] } },
      orderBy: { createdAt: "desc" },
    });
  }
  const openPlayPlayerId = info.metadata?.openPlayPlayerId;
  if (openPlayPlayerId) {
    return prisma.payment.findUnique({ where: { openPlayPlayerId } });
  }
  return null;
}
