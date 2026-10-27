"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { CreditCard, QrCode } from "lucide-react";
import { api, ApiError } from "@/lib/client";
import { useToast } from "./ui/toast";
import { Button } from "./ui/button";
import { Badge, Card, EmptyState, Field, inputClass, Skeleton } from "./ui/primitives";
import { peso, cn } from "@/lib/utils";

type Payment = {
  status: string;
  method: string | null;
  amount: number;
  paidAt: string | null;
};
type Booking = {
  id: string;
  reference: string;
  startAt: string;
  endAt: string;
  durationMins: number;
  total: number;
  status: string;
  court: { name: string; number: number };
  payments: Payment[];
};

const TABS = ["Upcoming", "Past", "Payments", "Profile"] as const;
type Tab = (typeof TABS)[number];

const STATUS_TONE: Record<string, "green" | "amber" | "red" | "neutral"> = {
  CONFIRMED: "green",
  CHECKED_IN: "green",
  COMPLETED: "neutral",
  PAYMENT_PENDING: "amber",
  PENDING: "amber",
  CANCELLED: "red",
  REFUNDED: "red",
  NO_SHOW: "red",
  EXPIRED: "neutral",
};

function fmt(iso: string, opts: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", ...opts }).format(
    new Date(iso),
  );
}

function BookingRow({
  booking,
  onCancel,
  onPay,
  busy,
}: {
  booking: Booking;
  onCancel?: (booking: Booking) => void;
  onPay?: (booking: Booking) => void;
  busy: boolean;
}) {
  const awaitingPayment = booking.status === "PAYMENT_PENDING";
  const canShowQr = ["CONFIRMED", "CHECKED_IN", "COMPLETED"].includes(booking.status);

  return (
    <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="flex flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs tracking-wider text-white/40">
              {booking.reference}
            </span>
            <Badge tone={STATUS_TONE[booking.status] ?? "neutral"}>
              {booking.status.replace(/_/g, " ").toLowerCase()}
            </Badge>
          </div>
          <p className="mt-1.5 text-base font-semibold text-white">{booking.court.name}</p>
          <p className="mt-0.5 text-sm text-white/50">
            {fmt(booking.startAt, { weekday: "short", day: "numeric", month: "short" })} ·{" "}
            {fmt(booking.startAt, { hour: "numeric", minute: "2-digit" })} –{" "}
            {fmt(booking.endAt, { hour: "numeric", minute: "2-digit" })}
          </p>
        </div>

        <div className="text-right">
          <p className="text-base font-semibold text-white">{peso(booking.total)}</p>
          <p className="text-xs text-white/40">{booking.durationMins / 60}h</p>
        </div>

        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          {awaitingPayment && onPay && (
            <Button size="sm" onClick={() => onPay(booking)} disabled={busy}>
              <CreditCard size={15} aria-hidden />
              Pay now
            </Button>
          )}
          {canShowQr && (
            <Link href={`/booking/${booking.reference}/confirmation`}>
              <Button size="sm" variant="secondary">
                <QrCode size={15} aria-hidden />
                QR code
              </Button>
            </Link>
          )}
          {onCancel && ["CONFIRMED", "PAYMENT_PENDING"].includes(booking.status) && (
            <Button size="sm" variant="ghost" onClick={() => onCancel(booking)} disabled={busy}>
              Cancel
            </Button>
          )}
        </div>
      </Card>
    </motion.div>
  );
}

export function CustomerDashboard({
  name,
  cancellationPolicy,
}: {
  name: string;
  cancellationPolicy: string;
}) {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("Upcoming");
  const [upcoming, setUpcoming] = useState<Booking[] | null>(null);
  const [past, setPast] = useState<Booking[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([
        api<{ bookings: Booking[] }>("/api/bookings?scope=upcoming"),
        api<{ bookings: Booking[] }>("/api/bookings?scope=past"),
      ]);
      setUpcoming(a.bookings);
      setPast(b.bookings);
    } catch {
      toast.push("We couldn't load your bookings. Please refresh.", "error");
      setUpcoming([]);
      setPast([]);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const payments = useMemo(() => {
    const all = [...(upcoming ?? []), ...(past ?? [])];
    return all
      .flatMap((booking) =>
        booking.payments.map((payment) => ({ booking, payment })),
      )
      .sort(
        (a, b) =>
          new Date(b.payment.paidAt ?? b.booking.startAt).getTime() -
          new Date(a.payment.paidAt ?? a.booking.startAt).getTime(),
      );
  }, [upcoming, past]);

  async function pay(booking: Booking) {
    setBusy(true);
    try {
      const result = await api<{ checkoutUrl?: string }>("/api/checkout", {
        body: { bookingId: booking.id },
      });
      if (result.checkoutUrl) window.location.href = result.checkoutUrl;
      else await load();
    } catch (error) {
      toast.push(error instanceof ApiError ? error.message : "Couldn't start payment.", "error");
      setBusy(false);
    }
  }

  async function cancel(booking: Booking) {
    if (!window.confirm(`Cancel booking ${booking.reference}? ${cancellationPolicy}`)) return;
    setBusy(true);
    try {
      await api(`/api/bookings/${booking.id}/cancel`, { body: {} });
      toast.push("Booking cancelled.", "info");
      await load();
    } catch (error) {
      toast.push(
        error instanceof ApiError ? error.message : "Couldn't cancel that booking.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <header className="mb-7">
        <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-pickle-400">
          Dashboard
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">
          Hi, {name.split(" ")[0]}
        </h1>
      </header>

      <div role="tablist" aria-label="Dashboard sections" className="mb-6 flex flex-wrap gap-1.5">
        {TABS.map((item) => (
          <button
            key={item}
            role="tab"
            aria-selected={tab === item}
            onClick={() => setTab(item)}
            className={cn(
              "relative rounded-full px-4 py-2 text-sm font-medium transition",
              tab === item ? "text-ink" : "text-white/55 hover:text-white",
            )}
          >
            {tab === item && (
              <motion.span
                layoutId="dash-tab"
                className="absolute inset-0 rounded-full bg-pickle-500"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
            <span className="relative">{item}</span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          {tab === "Upcoming" &&
            (upcoming === null ? (
              <div className="space-y-3">
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-28 w-full" />
              </div>
            ) : upcoming.length === 0 ? (
              <EmptyState
                title="No upcoming bookings"
                description="Your next game is one tap away. Live availability, instant confirmation."
                action={
                  <Link href="/book">
                    <Button>Book a court</Button>
                  </Link>
                }
              />
            ) : (
              <div className="space-y-3">
                {upcoming.map((booking) => (
                  <BookingRow
                    key={booking.id}
                    booking={booking}
                    onCancel={cancel}
                    onPay={pay}
                    busy={busy}
                  />
                ))}
              </div>
            ))}

          {tab === "Past" &&
            (past === null ? (
              <Skeleton className="h-28 w-full" />
            ) : past.length === 0 ? (
              <EmptyState
                title="Nothing here yet"
                description="Once you've played a session it will show up in your history."
              />
            ) : (
              <div className="space-y-3">
                {past.map((booking) => (
                  <BookingRow key={booking.id} booking={booking} busy={busy} />
                ))}
              </div>
            ))}

          {tab === "Payments" &&
            (payments.length === 0 ? (
              <EmptyState
                title="No payments yet"
                description="Payments made through GCash, Maya or card will be listed here."
              />
            ) : (
              <Card className="overflow-x-auto p-0">
                <table className="w-full min-w-[540px] text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-[0.14em] text-white/35">
                      <th className="px-5 py-3 font-semibold">Date</th>
                      <th className="px-5 py-3 font-semibold">Booking</th>
                      <th className="px-5 py-3 font-semibold">Method</th>
                      <th className="px-5 py-3 font-semibold">Status</th>
                      <th className="px-5 py-3 text-right font-semibold">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map(({ booking, payment }, index) => (
                      <tr key={`${booking.id}-${index}`} className="border-b border-white/5 last:border-0">
                        <td className="px-5 py-3 text-white/70">
                          {payment.paidAt
                            ? fmt(payment.paidAt, { day: "numeric", month: "short", year: "numeric" })
                            : "—"}
                        </td>
                        <td className="px-5 py-3 font-mono text-xs text-white/50">
                          {booking.reference}
                        </td>
                        <td className="px-5 py-3 text-white/70">{payment.method ?? "—"}</td>
                        <td className="px-5 py-3">
                          <Badge tone={payment.status === "PAID" ? "green" : "amber"}>
                            {payment.status.toLowerCase()}
                          </Badge>
                        </td>
                        <td className="px-5 py-3 text-right font-semibold text-white">
                          {peso(payment.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            ))}

          {tab === "Profile" && <ProfilePanel />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function ProfilePanel() {
  const toast = useToast();
  const [profile, setProfile] = useState<{
    fullName: string;
    email: string;
    mobile: string | null;
    emergencyContact: string | null;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [pwSaving, setPwSaving] = useState(false);

  useEffect(() => {
    api<{ profile: typeof profile }>("/api/account/profile")
      .then((data) => setProfile(data.profile))
      .catch(() => toast.push("Couldn't load your profile.", "error"));
  }, [toast]);

  if (!profile) return <Skeleton className="h-64 w-full" />;

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    if (!profile) return;
    setSaving(true);
    try {
      await api("/api/account/profile", {
        method: "PATCH",
        body: {
          fullName: profile.fullName,
          mobile: profile.mobile ?? "",
          emergencyContact: profile.emergencyContact || null,
        },
      });
      toast.push("Profile updated.");
    } catch (error) {
      toast.push(error instanceof ApiError ? error.message : "Couldn't save changes.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function savePassword(event: React.FormEvent) {
    event.preventDefault();
    setPwSaving(true);
    try {
      await api("/api/account/password", { body: pw });
      setPw({ currentPassword: "", newPassword: "", confirmPassword: "" });
      toast.push("Password changed. Other devices have been signed out.");
    } catch (error) {
      toast.push(
        error instanceof ApiError ? error.message : "Couldn't change your password.",
        "error",
      );
    } finally {
      setPwSaving(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <h2 className="text-base font-semibold text-white">Profile</h2>
        <form onSubmit={saveProfile} className="mt-4 space-y-4">
          <Field label="Full name">
            <input
              className={inputClass}
              value={profile.fullName}
              onChange={(e) => setProfile({ ...profile, fullName: e.target.value })}
            />
          </Field>
          <Field label="Email" hint="Contact us to change the email on your account.">
            <input className={inputClass} value={profile.email} disabled />
          </Field>
          <Field label="Mobile number">
            <input
              className={inputClass}
              value={profile.mobile ?? ""}
              onChange={(e) => setProfile({ ...profile, mobile: e.target.value })}
            />
          </Field>
          <Field label="Emergency contact" hint="Optional — name and number.">
            <input
              className={inputClass}
              value={profile.emergencyContact ?? ""}
              onChange={(e) => setProfile({ ...profile, emergencyContact: e.target.value })}
            />
          </Field>
          <Button type="submit" loading={saving}>
            Save changes
          </Button>
        </form>
      </Card>

      <Card>
        <h2 className="text-base font-semibold text-white">Change password</h2>
        <form onSubmit={savePassword} className="mt-4 space-y-4">
          <Field label="Current password">
            <input
              type="password"
              autoComplete="current-password"
              className={inputClass}
              value={pw.currentPassword}
              onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })}
            />
          </Field>
          <Field
            label="New password"
            hint="At least 10 characters with upper case, lower case and a number."
          >
            <input
              type="password"
              autoComplete="new-password"
              className={inputClass}
              value={pw.newPassword}
              onChange={(e) => setPw({ ...pw, newPassword: e.target.value })}
            />
          </Field>
          <Field label="Confirm new password">
            <input
              type="password"
              autoComplete="new-password"
              className={inputClass}
              value={pw.confirmPassword}
              onChange={(e) => setPw({ ...pw, confirmPassword: e.target.value })}
            />
          </Field>
          <Button type="submit" variant="secondary" loading={pwSaving}>
            Update password
          </Button>
        </form>
      </Card>
    </div>
  );
}
