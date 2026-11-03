import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyWebhookSignature } from "@/lib/paymongo";
import { env } from "@/lib/env";
import {
  eventTypeOf,
  fulfil,
  markFailed,
  type WebhookEnvelope,
} from "@/lib/payment-fulfilment";

// Node runtime: we need the raw body bytes and node:crypto for the HMAC.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  const eventType = eventTypeOf(envelope);
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

/**
 * Browser-friendly check: opening this URL confirms it is the right address to
 * register with PayMongo and whether the webhook secret is set. Reveals no secrets.
 */
export function GET() {
  return NextResponse.json({
    ok: true,
    message: "PayMongo webhook endpoint is reachable. Register this exact URL in PayMongo.",
    webhookSecretConfigured: Boolean(env.PAYMONGO_WEBHOOK_SECRET),
    livemode: env.PAYMONGO_LIVEMODE,
  });
}
