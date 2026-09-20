import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env, paymentMethods } from "./env";
import { AppError } from "./errors";

/**
 * PayMongo integration — verified against the official docs on 2026-09-19.
 *
 * Endpoint:  POST https://api.paymongo.com/v2/checkout_sessions
 *   PayMongo recommends /v2 for new integrations; it defers Payment Intent
 *   creation until the customer picks a method, which is what unlocks
 *   pass-on fees. /v1 creates the intent up front and receives no new features.
 * Auth:      HTTP Basic, secret key as the username, empty password.
 * Amounts:   integer centavos, PHP.
 * Webhook:   checkout_session.payment.paid, signed with the endpoint secret
 *            and delivered in the `Paymongo-Signature` header.
 *
 * The secret key is read from the environment inside this module only, which
 * is marked `server-only` — it can never be bundled into client JavaScript.
 */
const API_BASE = "https://api.paymongo.com";

type CheckoutSessionResponse = {
  data: {
    id: string;
    attributes: {
      checkout_url: string;
      client_key?: string;
      payment_intent?: { id: string } | null;
      reference_number?: string;
      status?: string;
    };
  };
};

function authHeader(): string {
  if (!env.PAYMONGO_SECRET_KEY) {
    throw new AppError(
      "Online payments are not configured yet. Please contact the facility.",
      503,
      "payments_unconfigured",
    );
  }
  return `Basic ${Buffer.from(`${env.PAYMONGO_SECRET_KEY}:`).toString("base64")}`;
}

async function call<T>(
  path: string,
  init: { method: string; body?: unknown; idempotencyKey?: string },
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: authHeader(),
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  // Retry-safe: replaying the same key never creates a second session.
  if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;

  const res = await fetch(`${API_BASE}${path}`, {
    method: init.method,
    headers,
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });

  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = {};
  }

  if (!res.ok) {
    // Log the provider detail; show the customer nothing technical.
    console.error("[paymongo] request failed", { path, status: res.status, body: text.slice(0, 800) });
    throw new AppError(
      "Payment could not be started. Please try again in a moment.",
      502,
      "payment_provider_error",
    );
  }

  return json as T;
}

export type LineItem = { name: string; amount: number; quantity: number; description?: string };

export async function createCheckoutSession(params: {
  referenceNumber: string;
  lineItems: LineItem[];
  successUrl: string;
  cancelUrl: string;
  billing: { name: string; email: string; phone?: string | null };
  description: string;
  metadata?: Record<string, string>;
  idempotencyKey: string;
}): Promise<{ id: string; checkoutUrl: string; paymentIntentId: string | null }> {
  const body = {
    data: {
      attributes: {
        line_items: params.lineItems.map((item) => ({
          name: item.name,
          amount: item.amount, // centavos
          currency: "PHP",
          quantity: item.quantity,
          ...(item.description ? { description: item.description } : {}),
        })),
        payment_method_types: paymentMethods,
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        reference_number: params.referenceNumber,
        description: params.description,
        send_email_receipt: true,
        billing: {
          name: params.billing.name,
          email: params.billing.email,
          ...(params.billing.phone ? { phone: params.billing.phone } : {}),
        },
        metadata: params.metadata ?? {},
      },
    },
  };

  const json = await call<CheckoutSessionResponse>("/v2/checkout_sessions", {
    method: "POST",
    body,
    idempotencyKey: params.idempotencyKey,
  });

  return {
    id: json.data.id,
    checkoutUrl: json.data.attributes.checkout_url,
    paymentIntentId: json.data.attributes.payment_intent?.id ?? null,
  };
}

export async function retrieveCheckoutSession(id: string) {
  return call<CheckoutSessionResponse>(`/v2/checkout_sessions/${id}`, { method: "GET" });
}

export async function expireCheckoutSession(id: string) {
  try {
    await call(`/v2/checkout_sessions/${id}/expire`, { method: "POST" });
  } catch (error) {
    // Expiry is best-effort housekeeping; a stale session is harmless because
    // we only ever credit a booking from a verified webhook.
    console.error("[paymongo] expire failed", error);
  }
}

export async function refundPayment(params: {
  paymentId: string;
  amount: number;
  reason?: "duplicate" | "fraudulent" | "requested_by_customer" | "others";
  idempotencyKey: string;
}) {
  return call<{ data: { id: string; attributes: { status: string } } }>("/v1/refunds", {
    method: "POST",
    body: {
      data: {
        attributes: {
          amount: params.amount,
          payment_id: params.paymentId,
          reason: params.reason ?? "requested_by_customer",
        },
      },
    },
    idempotencyKey: params.idempotencyKey,
  });
}

/**
 * Verifies the `Paymongo-Signature` header.
 *
 * Format: `t=<unix-seconds>,te=<test-signature>,li=<live-signature>`
 * The signature is HMAC-SHA256 over `${timestamp}.${rawRequestBody}` keyed with
 * the webhook endpoint secret. Test-mode deliveries populate `te`, live-mode
 * deliveries populate `li`.
 *
 * The raw body must be passed exactly as received — any JSON parse/re-stringify
 * changes the bytes and invalidates the comparison.
 */
export function verifyWebhookSignature(params: {
  rawBody: string;
  signatureHeader: string | null;
  secret?: string;
  livemode?: boolean;
  toleranceSeconds?: number;
  now?: Date;
}): { valid: boolean; reason?: string } {
  const secret = params.secret ?? env.PAYMONGO_WEBHOOK_SECRET;
  if (!secret) return { valid: false, reason: "webhook secret not configured" };
  if (!params.signatureHeader) return { valid: false, reason: "missing signature header" };

  const parts = Object.fromEntries(
    params.signatureHeader.split(",").map((chunk) => {
      const idx = chunk.indexOf("=");
      return [chunk.slice(0, idx).trim(), chunk.slice(idx + 1).trim()];
    }),
  ) as Record<string, string>;

  const timestamp = parts.t;
  if (!timestamp) return { valid: false, reason: "missing timestamp" };

  const livemode = params.livemode ?? env.PAYMONGO_LIVEMODE;
  const provided = livemode ? parts.li : parts.te;
  if (!provided) return { valid: false, reason: "missing signature for this mode" };

  // Replay protection.
  const tolerance = params.toleranceSeconds ?? 300;
  const nowSeconds = Math.floor((params.now ?? new Date()).getTime() / 1000);
  const skew = Math.abs(nowSeconds - Number(timestamp));
  if (!Number.isFinite(skew) || skew > tolerance) {
    return { valid: false, reason: "timestamp outside tolerance" };
  }

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${params.rawBody}`)
    .digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  if (a.length !== b.length) return { valid: false, reason: "signature length mismatch" };
  if (!timingSafeEqual(a, b)) return { valid: false, reason: "signature mismatch" };

  return { valid: true };
}
