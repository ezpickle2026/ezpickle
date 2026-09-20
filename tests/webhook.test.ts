import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { verifyWebhookSignature } from "@/lib/paymongo";

const SECRET = "whsk_test_secret";
const RAW_BODY = JSON.stringify({
  data: {
    id: "evt_123",
    attributes: {
      type: "checkout_session.payment.paid",
      livemode: false,
      data: { id: "cs_123", attributes: { payment_intent: { id: "pi_123" } } },
    },
  },
});

function sign(rawBody: string, timestamp: number, secret = SECRET) {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

function header({
  timestamp,
  test,
  live,
}: {
  timestamp: number;
  test?: string;
  live?: string;
}) {
  const parts = [`t=${timestamp}`];
  if (test) parts.push(`te=${test}`);
  if (live) parts.push(`li=${live}`);
  return parts.join(",");
}

const now = new Date("2026-09-19T10:00:00Z");
const nowSeconds = Math.floor(now.getTime() / 1000);

describe("verifyWebhookSignature", () => {
  it("accepts a correctly signed test-mode payload", () => {
    const result = verifyWebhookSignature({
      rawBody: RAW_BODY,
      signatureHeader: header({ timestamp: nowSeconds, test: sign(RAW_BODY, nowSeconds) }),
      secret: SECRET,
      livemode: false,
      now,
    });
    expect(result.valid).toBe(true);
  });

  it("rejects a tampered body", () => {
    const signature = sign(RAW_BODY, nowSeconds);
    const tampered = RAW_BODY.replace("cs_123", "cs_attacker");

    const result = verifyWebhookSignature({
      rawBody: tampered,
      signatureHeader: header({ timestamp: nowSeconds, test: signature }),
      secret: SECRET,
      livemode: false,
      now,
    });
    expect(result.valid).toBe(false);
  });

  it("rejects a signature made with the wrong secret", () => {
    const result = verifyWebhookSignature({
      rawBody: RAW_BODY,
      signatureHeader: header({
        timestamp: nowSeconds,
        test: sign(RAW_BODY, nowSeconds, "whsk_wrong"),
      }),
      secret: SECRET,
      livemode: false,
      now,
    });
    expect(result.valid).toBe(false);
  });

  it("rejects a replayed request outside the tolerance window", () => {
    const old = nowSeconds - 600; // ten minutes ago, tolerance is five
    const result = verifyWebhookSignature({
      rawBody: RAW_BODY,
      signatureHeader: header({ timestamp: old, test: sign(RAW_BODY, old) }),
      secret: SECRET,
      livemode: false,
      now,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/tolerance/i);
  });

  it("accepts a request just inside the tolerance window", () => {
    const recent = nowSeconds - 290;
    const result = verifyWebhookSignature({
      rawBody: RAW_BODY,
      signatureHeader: header({ timestamp: recent, test: sign(RAW_BODY, recent) }),
      secret: SECRET,
      livemode: false,
      now,
    });
    expect(result.valid).toBe(true);
  });

  it("will not accept a test signature while running in live mode", () => {
    const result = verifyWebhookSignature({
      rawBody: RAW_BODY,
      signatureHeader: header({ timestamp: nowSeconds, test: sign(RAW_BODY, nowSeconds) }),
      secret: SECRET,
      livemode: true,
      now,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/mode/i);
  });

  it("accepts a live signature in live mode", () => {
    const result = verifyWebhookSignature({
      rawBody: RAW_BODY,
      signatureHeader: header({ timestamp: nowSeconds, live: sign(RAW_BODY, nowSeconds) }),
      secret: SECRET,
      livemode: true,
      now,
    });
    expect(result.valid).toBe(true);
  });

  it("rejects a missing header", () => {
    const result = verifyWebhookSignature({
      rawBody: RAW_BODY,
      signatureHeader: null,
      secret: SECRET,
      now,
    });
    expect(result.valid).toBe(false);
  });

  it("rejects a malformed header with no timestamp", () => {
    const result = verifyWebhookSignature({
      rawBody: RAW_BODY,
      signatureHeader: `te=${sign(RAW_BODY, nowSeconds)}`,
      secret: SECRET,
      now,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/timestamp/i);
  });

  it("refuses to verify when no webhook secret is configured", () => {
    const result = verifyWebhookSignature({
      rawBody: RAW_BODY,
      signatureHeader: header({ timestamp: nowSeconds, test: sign(RAW_BODY, nowSeconds) }),
      secret: "",
      now,
    });
    expect(result.valid).toBe(false);
  });

  it("is sensitive to whitespace, proving the raw body is what is verified", () => {
    // Re-stringifying JSON changes bytes; the signature must then fail.
    const reparsed = JSON.stringify(JSON.parse(RAW_BODY), null, 2);
    const result = verifyWebhookSignature({
      rawBody: reparsed,
      signatureHeader: header({ timestamp: nowSeconds, test: sign(RAW_BODY, nowSeconds) }),
      secret: SECRET,
      livemode: false,
      now,
    });
    expect(result.valid).toBe(false);
  });
});
