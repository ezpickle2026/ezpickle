import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_URL: z.string().url().default("http://localhost:3000"),
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
  RESEND_API_KEY: z.string().default(""),
  MAIL_FROM: z.string().default("EzPickle <bookings@ezpickle.ph>"),
  SEED_ENABLED: z.string().default("false"),
  SEED_PASSWORD: z.string().default(""),
});

const parsed = schema.safeParse(process.env);

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
