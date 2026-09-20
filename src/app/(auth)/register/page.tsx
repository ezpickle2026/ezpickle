"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { api, ApiError } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Card, Field, inputClass } from "@/components/ui/primitives";

type FieldErrors = Record<string, string>;

function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";

  const [form, setForm] = useState({
    fullName: "",
    email: "",
    mobile: "",
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setErrors({});
    try {
      await api("/api/auth/register", { body: form });
      router.push(next);
      router.refresh();
    } catch (err) {
      // `details` is Zod's flattened fieldErrors: { field: string[] }.
      if (err instanceof ApiError && err.details && typeof err.details === "object") {
        const map: FieldErrors = {};
        for (const [field, messages] of Object.entries(
          err.details as Record<string, string[] | undefined>,
        )) {
          if (messages?.[0]) map[field] = messages[0];
        }
        setErrors(map);
        setError(Object.keys(map).length ? null : err.message);
      } else {
        setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      }
      setLoading(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <Card>
        <h1 className="text-xl font-bold tracking-tight text-white">Create your account</h1>
        <p className="mt-1 text-sm text-white/45">
          One account for court bookings, Open Play and payments.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
          <Field label="Full name" error={errors.fullName}>
            <input
              name="fullName"
              autoComplete="name"
              required
              value={form.fullName}
              onChange={set("fullName")}
              className={inputClass}
              placeholder="Juan dela Cruz"
            />
          </Field>

          <Field label="Email" error={errors.email}>
            <input
              type="email"
              name="email"
              autoComplete="email"
              required
              value={form.email}
              onChange={set("email")}
              className={inputClass}
              placeholder="you@example.com"
            />
          </Field>

          <Field label="Mobile number" error={errors.mobile} hint="Philippine mobile, e.g. 09171234567">
            <input
              name="mobile"
              inputMode="tel"
              autoComplete="tel"
              required
              value={form.mobile}
              onChange={set("mobile")}
              className={inputClass}
              placeholder="09171234567"
            />
          </Field>

          <Field
            label="Password"
            error={errors.password}
            hint="At least 10 characters with upper case, lower case and a number."
          >
            <input
              type="password"
              name="password"
              autoComplete="new-password"
              required
              value={form.password}
              onChange={set("password")}
              className={inputClass}
            />
          </Field>

          <Field label="Confirm password" error={errors.confirmPassword}>
            <input
              type="password"
              name="confirmPassword"
              autoComplete="new-password"
              required
              value={form.confirmPassword}
              onChange={set("confirmPassword")}
              className={inputClass}
            />
          </Field>

          {error && (
            <p role="alert" className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}

          <Button type="submit" loading={loading} className="w-full">
            Create account
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-white/45">
          Already have an account?{" "}
          <Link
            href={`/login?next=${encodeURIComponent(next)}`}
            className="font-semibold text-pickle-400 hover:text-pickle-300"
          >
            Sign in
          </Link>
        </p>
      </Card>
    </motion.div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  );
}
