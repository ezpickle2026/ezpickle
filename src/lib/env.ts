import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  // Accept "example.com" as well as "https://example.com/" — a missing scheme
  // is the most common mistake when pasting a Railway domain into Variables.
  APP_URL: z.preprocess((v) => {
    if (typeof v !== "string" || v.trim() === "") return undefined;
    let url = v.trim().replace(/^["']|["']$/g, "").replace(/\/+$/, "");
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    return url;
  }, z.string().url().default("http://localhost:3000")),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  PAYMONGO_SECRET_KEY: z.string().default(""),
  PAYMONGO_PUBLIC_KEY: z.string().default(""),
  PAYMONGO_WEBHOOK_SECRET: z.string().default(""),
  PAYMONGO_LIVEMODE: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  PAYMONGO_PAYMENT_METHODS: z.string().default("card,gcash,paymaya,grab_pay,qrph"),
  CRON_SECRET: z.string().default(""),
  // Gmail sending: the Gmail address and a Google "App Password" for it
  // (not the normal Gmail password). Takes priority over Resend when set.
  GMAIL_USER: z.string().trim().default("ezpickle2026@gmail.com"),
  // Google shows App Passwords with spaces ("abcd efgh ijkl mnop"); strip them.
  GMAIL_APP_PASSWORD: z
    .string()
    .default("")
    .transform((v) => v.replace(/\s+/g, "")),
  RESEND_API_KEY: z.string().default(""),
  MAIL_FROM: z.string().default("EzPickle <ezpickle2026@gmail.com>"),
  SEED_ENABLED: z.string().default("false"),
  SEED_PASSWORD: z.string().default(""),
});

// `next build` imports every route to collect page data. Railway (and most
// hosts) may not expose runtime secrets like DATABASE_URL / SESSION_SECRET to
// the build step, so during the build we fall back to placeholders instead of
// crashing. At runtime (`next start`) validation is still strict.
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

const buildPlaceholders = {
  DATABASE_URL: "postgresql://build:build@localhost:5432/build",
  SESSION_SECRET: "build-time-placeholder-secret-not-used-at-runtime",
};

let parsed = schema.safeParse(isBuildPhase ? { ...buildPlaceholders, ...process.env } : process.env);

if (!parsed.success && isBuildPhase) {
  // Never fail the build over a bad variable; `next start` re-validates and
  // fails loudly there, which is where the real values matter.
  const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  console.warn(`[env] Ignoring invalid environment during build (${issues}). It will be checked again at startup.`);
  parsed = schema.safeParse({ ...buildPlaceholders, NODE_ENV: "production" });
}

if (!parsed.success) {
  // Fail fast and loudly at boot rather than mysteriously at request time.
  const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n  ");
  throw new Error(`Invalid environment configuration:\n  ${issues}`);
}

export const env = parsed.data;

export const paymentMethods = env.PAYMONGO_PAYMENT_METHODS.split(",")
  .map((m) => m.trim())
  .filter(Boolean);

export const isProd = env.NODE_ENV === "production";
