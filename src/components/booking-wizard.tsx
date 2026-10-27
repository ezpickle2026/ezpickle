"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2, RefreshCw } from "lucide-react";
import { api, ApiError } from "@/lib/client";
import { useRealtime } from "@/hooks/use-realtime";
import { useToast } from "./ui/toast";
import { Button } from "./ui/button";
import { Badge, Card, Field, inputClass, Skeleton, StatusDot } from "./ui/primitives";
import { peso, cn } from "@/lib/utils";

type Slot = { startMin: number; endMin: number; state: SlotState; price: number };
type SlotState = "AVAILABLE" | "BOOKED" | "HELD" | "BLOCKED" | "CLOSED" | "PAST";
type CourtRow = {
  courtId: string;
  courtName: string;
  courtNumber: number;
  hourlyPrice: number;
  status: string;
  slots: Slot[];
};
type Availability = {
  date: string;
  intervalMins: number;
  openingMin: number;
  closingMin: number;
  courts: CourtRow[];
};

const STEPS = ["Date", "Court", "Time", "Details", "Payment"] as const;

function timeLabel(minutes: number) {
  const h24 = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const suffix = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function BookingWizard({
  initialDate,
  durations,
  signedIn,
}: {
  initialDate: string;
  durations: number[];
  signedIn: boolean;
}) {
  const router = useRouter();
  const toast = useToast();

  const [date, setDate] = useState(initialDate);
  const [data, setData] = useState<Availability | null>(null);
  const [loading, setLoading] = useState(true);
  const [courtId, setCourtId] = useState<string | null>(null);
  const [startMin, setStartMin] = useState<number | null>(null);
  const [duration, setDuration] = useState(durations[0]);
  const [promo, setPromo] = useState("");
  const [notes, setNotes] = useState("");
  const [quote, setQuote] = useState<{ subtotal: number; discount: number; total: number } | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(
    async (targetDate: string, quiet = false) => {
      if (!quiet) setLoading(true);
      try {
        setData(await api<Availability>(`/api/availability?date=${targetDate}`));
      } catch (error) {
        toast.push(error instanceof ApiError ? error.message : "Could not load availability.", "error");
      } finally {
        setLoading(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    void load(date);
  }, [date, load]);

  // Live updates: someone else booking a slot must be visible immediately.
  useRealtime("availability", (event) => {
    const payload = event as { date?: string; courtId?: string };
    if (payload.date && payload.date !== date) return;

    void load(date, true);

    if (payload.courtId && payload.courtId === courtId && startMin !== null) {
      toast.push("Court availability just changed — double-check your slot.", "warning");
    }
  });

  const court = useMemo(
    () => data?.courts.find((c) => c.courtId === courtId) ?? null,
    [data, courtId],
  );

  /** A start time is only valid if every block it spans is free. */
  const canStartAt = useCallback(
    (row: CourtRow, start: number, mins: number) => {
      if (!data) return false;
      const blocks = mins / data.intervalMins;
      for (let i = 0; i < blocks; i++) {
        const slot = row.slots.find((s) => s.startMin === start + i * data.intervalMins);
        if (!slot || slot.state !== "AVAILABLE") return false;
      }
      return true;
    },
    [data],
  );

  useEffect(() => {
    // Any change to the selection invalidates the quote.
    setQuote(null);
    if (!courtId || startMin === null) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const result = await api<{ subtotal: number; discount: number; total: number }>("/api/quote", {
          body: { courtId, date, startMin, durationMins: duration, promoCode: promo || null },
          signal: controller.signal,
        });
        setQuote(result);
      } catch (error) {
        if (error instanceof ApiError) setQuote(null);
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [courtId, startMin, duration, promo, date]);

  const step = startMin !== null ? 3 : courtId ? 2 : 1;

  const submit = async () => {
    if (!signedIn) {
      const next = encodeURIComponent("/book");
      router.push(`/login?next=${next}`);
      return;
    }
    if (!courtId || startMin === null) return;

    setSubmitting(true);
    try {
      const booking = await api<{ id: string; reference: string }>("/api/bookings", {
        body: { courtId, date, startMin, durationMins: duration, promoCode: promo || null, notes },
      });

      const checkout = await api<{ checkoutUrl?: string; alreadyPaid?: boolean }>("/api/checkout", {
        body: { bookingId: booking.id },
      });

      if (checkout.checkoutUrl) {
        window.location.href = checkout.checkoutUrl;
        return;
      }
      router.push(`/booking/${booking.reference}/confirmation`);
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : "Something went wrong. Please try again.";
      toast.push(message, "error");

      if (error instanceof ApiError && error.code === "slot_taken") {
        setStartMin(null);
        void load(date, true);
      }
      setSubmitting(false);
    }
  };

  const days = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date(today.getTime() + i * 864e5);
      const iso = d.toISOString().slice(0, 10);
      return {
        iso,
        weekday: d.toLocaleDateString("en-PH", { weekday: "short" }),
        day: d.getDate(),
        month: d.toLocaleDateString("en-PH", { month: "short" }),
      };
    });
  }, []);

  return (
    <div className="space-y-6">
      <Stepper current={step} />

      {/* ---- Date ---- */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white/80">1. Choose a date</h2>
          <button
            type="button"
            onClick={() => load(date)}
            className="inline-flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70"
          >
            <RefreshCw size={13} aria-hidden />
            Refresh
          </button>
        </div>

        <div className="ezp-scroll -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {days.map((d) => (
            <button
              key={d.iso}
              type="button"
              onClick={() => {
                setDate(d.iso);
                setCourtId(null);
                setStartMin(null);
              }}
              aria-pressed={date === d.iso}
              className={cn(
                "shrink-0 rounded-xl border px-3.5 py-2.5 text-center transition",
                date === d.iso
                  ? "border-pickle-500 bg-pickle-500/12 text-white"
                  : "border-white/10 text-white/55 hover:border-white/25 hover:text-white",
              )}
            >
              <span className="block text-[10px] uppercase tracking-wide opacity-60">{d.weekday}</span>
              <span className="block text-lg font-bold leading-tight">{d.day}</span>
              <span className="block text-[10px] opacity-60">{d.month}</span>
            </button>
          ))}
        </div>
      </Card>

      {/* ---- Duration ---- */}
      <Card>
        <h2 className="mb-3 text-sm font-semibold text-white/80">2. How long?</h2>
        <div className="flex flex-wrap gap-2">
          {durations.map((mins) => (
            <button
              key={mins}
              type="button"
              onClick={() => {
                setDuration(mins);
                setStartMin(null);
              }}
              aria-pressed={duration === mins}
              className={cn(
                "rounded-full border px-4 py-2 text-sm font-semibold transition",
                duration === mins
                  ? "border-pickle-500 bg-pickle-500 text-ink"
                  : "border-white/12 text-white/60 hover:border-white/30 hover:text-white",
              )}
            >
              {mins % 60 === 0 ? `${mins / 60} hour${mins > 60 ? "s" : ""}` : `${mins} min`}
            </button>
          ))}
        </div>
      </Card>

      {/* ---- Grid ---- */}
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-white/80">3. Pick a court and time</h2>
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-white/45">
            <Legend state="AVAILABLE" label="Available" />
            <Legend state="HELD" label="Being paid for" />
            <Legend state="BOOKED" label="Booked" />
            <Legend state="BLOCKED" label="Unavailable" />
          </div>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-28" />
                <div className="flex gap-1.5">
                  {Array.from({ length: 12 }).map((_, j) => (
                    <Skeleton key={j} className="h-9 w-16" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={date + duration}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.22 }}
              className="space-y-5"
            >
              {data?.courts.map((row) => {
                const startable = row.slots.filter((s) =>
                  canStartAt(row, s.startMin, duration),
                );

                return (
                  <div key={row.courtId}>
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-sm font-semibold">{row.courtName}</span>
                      <span className="text-xs text-white/35">{peso(row.hourlyPrice)}/hr</span>
                      {startable.length === 0 && (
                        <Badge tone="neutral">No {duration / 60}h slots left</Badge>
                      )}
                    </div>

                    <div className="ezp-scroll -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1.5">
                      {row.slots
                        .filter((s) => s.state !== "PAST")
                        .map((slot) => {
                          const selectable = canStartAt(row, slot.startMin, duration);
                          const selected = courtId === row.courtId && startMin === slot.startMin;
                          const covered =
                            courtId === row.courtId &&
                            startMin !== null &&
                            slot.startMin > startMin &&
                            slot.startMin < startMin + duration;

                          return (
                            <motion.button
                              key={slot.startMin}
                              type="button"
                              disabled={!selectable}
                              animate={selected ? { scale: 1.02 } : { scale: 1 }}
                              transition={{ type: "spring", stiffness: 420, damping: 26 }}
                              onClick={() => {
                                setCourtId(row.courtId);
                                setStartMin(slot.startMin);
                              }}
                              className={cn(
                                "relative shrink-0 rounded-lg border px-3 py-2 text-xs font-semibold transition",
                                selected &&
                                  "border-pickle-500 bg-pickle-500 text-ink shadow-[0_0_22px_-6px_rgba(111,207,43,0.8)]",
                                covered && !selected && "border-pickle-500/50 bg-pickle-500/20 text-white",
                                !selected &&
                                  !covered &&
                                  selectable &&
                                  "border-white/12 text-white/70 hover:border-pickle-500/60 hover:text-white",
                                !selectable &&
                                  "cursor-not-allowed border-white/6 text-white/20 line-through",
                              )}
                              aria-label={`${row.courtName} at ${timeLabel(slot.startMin)}, ${
                                selectable ? "available" : slot.state.toLowerCase()
                              }`}
                            >
                              {selected && (
                                <Check size={11} className="absolute right-1 top-1" aria-hidden />
                              )}
                              {timeLabel(slot.startMin)}
                            </motion.button>
                          );
                        })}
                    </div>
                  </div>
                );
              })}
            </motion.div>
          </AnimatePresence>
        )}
      </Card>

      {/* ---- Summary / pay ---- */}
      <AnimatePresence>
        {courtId && startMin !== null && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            <Card className="border-pickle-500/30">
              <h2 className="text-sm font-semibold text-white/80">4. Confirm and pay</h2>

              <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                <Row label="Court" value={court?.courtName ?? ""} />
                <Row
                  label="When"
                  value={`${timeLabel(startMin)} – ${timeLabel(startMin + duration)}`}
                />
                <Row label="Date" value={date} />
                <Row label="Duration" value={`${duration / 60} hour${duration > 60 ? "s" : ""}`} />
              </dl>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field label="Promo code" hint="Optional">
                  <input
                    className={inputClass}
                    value={promo}
                    onChange={(e) => setPromo(e.target.value.toUpperCase())}
                    placeholder="EZPICKLE10"
                    maxLength={24}
                  />
                </Field>
                <Field label="Notes for the facility" hint="Optional">
                  <input
                    className={inputClass}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Bringing 4 players, need 2 paddles"
                    maxLength={200}
                  />
                </Field>
              </div>

              <div className="mt-5 space-y-1.5 border-t border-white/10 pt-4 text-sm">
                <div className="flex justify-between text-white/50">
                  <span>Subtotal</span>
                  <span>{quote ? peso(quote.subtotal) : "—"}</span>
                </div>
                {quote && quote.discount > 0 && (
                  <div className="flex justify-between text-pickle-400">
                    <span>Discount</span>
                    <span>−{peso(quote.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold">
                  <span>Total</span>
                  <span className="text-pickle-400">
                    {quote ? (
                      peso(quote.total)
                    ) : (
                      <Loader2 size={18} className="animate-spin text-white/40" aria-hidden />
                    )}
                  </span>
                </div>
              </div>

              <Button
                className="mt-5 w-full"
                size="lg"
                loading={submitting}
                onClick={submit}
                disabled={!quote}
              >
                {signedIn ? "Continue to payment" : "Sign in to book"}
              </Button>

              <p className="mt-3 text-center text-xs text-white/35">
                Your slot is held while you pay. Payments are processed securely by PayMongo.
              </p>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-white/35">{label}</dt>
      <dd className="mt-0.5 font-semibold">{value}</dd>
    </div>
  );
}

function Legend({ state, label }: { state: "AVAILABLE" | "BOOKED" | "HELD" | "BLOCKED"; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <StatusDot state={state} />
      {label}
    </span>
  );
}

function Stepper({ current }: { current: number }) {
  return (
    <ol className="ezp-scroll flex items-center gap-2 overflow-x-auto pb-1" aria-label="Booking progress">
      {STEPS.map((label, i) => {
        const index = i + 1;
        const done = index < current;
        const active = index === current;
        return (
          <li key={label} className="flex shrink-0 items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition",
                done && "bg-pickle-500/15 text-pickle-300",
                active && "bg-pickle-500 text-ink",
                !done && !active && "bg-white/5 text-white/35",
              )}
            >
              {done ? <Check size={12} aria-hidden /> : <span>{index}</span>}
              {label}
            </span>
            {i < STEPS.length - 1 && (
              <span className="h-px w-5 bg-white/12" aria-hidden />
            )}
          </li>
        );
      })}
    </ol>
  );
}
