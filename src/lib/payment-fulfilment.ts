import "server-only";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { notify, sendBookingConfirmation } from "@/lib/notifications";
import { publish } from "@/lib/realtime";
import { promoteWaitlist } from "@/lib/openplay";
import { reference as makeReference } from "@/lib/reference";
import { formatManila } from "@/lib/time";
import { peso } from "@/lib/utils";
import { retrieveCheckoutSession } from "@/lib/paymongo";

export type WebhookEnvelope = {
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

/** The event type: PayMongo puts it at data.attributes.type (data.type is just "event"). */
export function eventTypeOf(envelope: WebhookEnvelope): string {
  const inner = envelope.data?.attributes?.type;
  if (inner) return inner;
  const outer = envelope.data?.type;
  return outer && outer !== "event" ? outer : "unknown";
}

export function extract(envelope: WebhookEnvelope) {
  // The paid checkout session lives at data.attributes.data in real events.
  const resource = (envelope.data?.attributes?.data ?? envelope.data?.data) as
    | NonNullable<NonNullable<WebhookEnvelope["data"]>["data"]>
    | undefined;
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
export async function fulfil(envelope: WebhookEnvelope) {
  const info = extract(envelope);

  const payment = await findPayment(info);
  if (!payment) {
    console.warn("[paymongo-webhook] no local payment matched", info.checkoutSessionId);
    return;
  }
  if (payment.status === "PAID") return; // already credited

  // The webhook and the reconcile safety net can race on the same payment.
  // Only the caller that actually flips it to PAID goes on to credit the
  // booking and email the customer, so nobody gets two confirmations.
  const credited = await prisma.$transaction(async (tx) => {
    const claimed = await tx.payment.updateMany({
      where: { id: payment.id, status: { not: "PAID" } },
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
    if (claimed.count === 0) return false;

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
    return true;
  });
  if (!credited) return;

  // Notifications and realtime happen after the transaction commits so a slow
  // mail provider can never hold a database lock open.
  if (payment.bookingId) {
    await sendBookingConfirmation(payment.bookingId, {
      method: info.method,
      referenceNumber: payment.referenceNumber,
    });
    const booking = await prisma.booking.findUnique({ where: { id: payment.bookingId } });
    if (booking) {
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

export async function markFailed(envelope: WebhookEnvelope) {
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


/* -------------------------------------------------------------------------- */
/* Safety net: ask PayMongo directly whether a checkout was paid.              */
/* Webhooks can be delayed, misconfigured or missed; this makes the booking    */
/* status self-healing whenever someone opens it.                              */
/* -------------------------------------------------------------------------- */

type SessionAttributes = {
  status?: string;
  reference_number?: string;
  metadata?: Record<string, string>;
  payment_intent?: { id?: string; attributes?: { status?: string } } | null;
  payments?: { id?: string; attributes?: { status?: string } }[];
};

const lastChecked = new Map<string, number>();
const CHECK_COOLDOWN_MS = 30_000;

function sessionIsPaid(a: SessionAttributes): boolean {
  if (a.payments?.some((p) => p.attributes?.status === "paid")) return true;
  if (a.payment_intent?.attributes?.status === "succeeded") return true;
  return false;
}

/** Checks one awaiting payment with PayMongo and credits it if it was paid. */
async function reconcilePayment(payment: { id: string; checkoutSessionId: string | null }) {
  if (!payment.checkoutSessionId) return false;

  const last = lastChecked.get(payment.id) ?? 0;
  if (Date.now() - last < CHECK_COOLDOWN_MS) return false;
  lastChecked.set(payment.id, Date.now());

  try {
    const session = await retrieveCheckoutSession(payment.checkoutSessionId);
    const attributes = (session.data.attributes ?? {}) as SessionAttributes;
    if (!sessionIsPaid(attributes)) {
      // Diagnostic only (rate-limited by the cooldown above): shows why it was not treated as paid.
      console.log("[reconcile] not paid yet", payment.checkoutSessionId, {
        status: attributes.status,
        payments: attributes.payments?.map((p) => p.attributes?.status),
        intent: attributes.payment_intent?.attributes?.status,
      });
      return false;
    }

    await fulfil({
      data: {
        id: `reconcile-${payment.checkoutSessionId}`,
        attributes: {
          type: "checkout_session.payment.paid",
          livemode: env.PAYMONGO_LIVEMODE,
          data: { id: session.data.id, attributes },
        },
      },
    } as WebhookEnvelope);
    return true;
  } catch (error) {
    console.error("[reconcile] could not verify payment", payment.id, error);
    return false;
  }
}

/** Reconciles any unpaid checkout attached to one booking (by id or reference). */
export async function reconcileBookingPayment(idOrReference: string) {
  const awaiting = await prisma.payment.findMany({
    where: {
      status: "AWAITING",
      booking: { OR: [{ id: idOrReference }, { reference: idOrReference.toUpperCase() }] },
    },
    select: { id: true, checkoutSessionId: true },
    take: 3,
  });
  await Promise.all(awaiting.map(reconcilePayment));
}

/** Reconciles recent unpaid checkouts (used by the admin Bookings list). */
export async function reconcileRecentPayments() {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const awaiting = await prisma.payment.findMany({
    where: { status: "AWAITING", checkoutSessionId: { not: null }, createdAt: { gte: since } },
    select: { id: true, checkoutSessionId: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  await Promise.all(awaiting.map(reconcilePayment));
}
