import "server-only";
import { createHmac } from "node:crypto";
import QRCode from "qrcode";
import { env } from "./env";

/**
 * The QR payload is signed so a screenshot cannot be edited into a different
 * booking. Staff scanning still re-reads the booking from the database — the
 * signature only short-circuits obviously forged codes.
 */
export function signBookingToken(bookingId: string, reference: string): string {
  const body = `${bookingId}.${reference}`;
  const sig = createHmac("sha256", env.SESSION_SECRET).update(body).digest("base64url").slice(0, 24);
  return `${body}.${sig}`;
}

export function verifyBookingToken(token: string): { bookingId: string; reference: string } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [bookingId, reference, sig] = parts;
  const expected = signBookingToken(bookingId, reference).split(".")[2];
  if (sig.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0 ? { bookingId, reference } : null;
}

export async function bookingQrDataUrl(bookingId: string, reference: string): Promise<string> {
  return QRCode.toDataURL(signBookingToken(bookingId, reference), {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 320,
    color: { dark: "#0A0A0A", light: "#FFFFFF" },
  });
}
