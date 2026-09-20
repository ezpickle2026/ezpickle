import "server-only";
import { randomBytes } from "node:crypto";

// Unambiguous alphabet: no O/0, no I/1 — these references get read aloud at
// the front desk and written on whiteboards.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function reference(prefix: string, length = 6): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return `${prefix}-${out}`;
}
