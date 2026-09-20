"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Clock3, Loader2, MapPin, Phone } from "lucide-react";
import { api } from "@/lib/client";
import { Button } from "./ui/button";
import { Card } from "./ui/primitives";
import { peso } from "@/lib/utils";

export type ConfirmationBooking = {
  reference: string;
  status: string;
  customerName: string;
  courtName: string;
  when: string;
  timeRange: string;
  durationMins: number;
  total: number;
  discount: number;
  paymentReference: string | null;
  paymentMethod: string | null;
  paid: boolean;
};

type Props = {
  booking: ConfirmationBooking;
  qr: string | null;
  facility: { name: string; address: string; phone: string };
};

/** A small, restrained burst — eight dots, not a confetti cannon. */
function Sparks() {
  const reduced = useReducedMotion();
  const dots = useMemo(
    () => Array.from({ length: 8 }, (_, i) => ({ angle: (i / 8) * Math.PI * 2, id: i })),
    [],
  );
  if (reduced) return null;

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
      {dots.map((dot) => (
        <motion.span
          key={dot.id}
          className="absolute size-1.5 rounded-full bg-pickle-500"
          initial={{ opacity: 0, x: 0, y: 0, scale: 0.6 }}
          animate={{
            opacity: [0, 1, 0],
            x: Math.cos(dot.angle) * 74,
            y: Math.sin(dot.angle) * 74,
            scale: [0.6, 1, 0.4],
          }}
          transition={{ duration: 1, delay: 0.45, ease: "easeOut" }}
        />
      ))}
    </div>
  );
}

function DrawnCheck() {
  const reduced = useReducedMotion();
  return (
    <div className="relative mx-auto flex size-24 items-center justify-center">
      <Sparks />
      <motion.span
        className="absolute inset-0 rounded-full bg-pickle-500/15 ring-1 ring-pickle-500/40"
        initial={reduced ? false : { scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      />
      <svg viewBox="0 0 48 48" className="relative size-10 text-pickle-400" aria-hidden>
        <motion.path
          d="M12 25.5 L20.5 34 L36 15"
          fill="none"
          stroke="currentColor"
          strokeWidth={4.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={reduced ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.5, delay: 0.2, ease: "easeOut" }}
        />
      </svg>
    </div>
  );
}

const rise = (delay: number) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] as const },
});

export function BookingConfirmation({ booking: initial, qr: initialQr, facility }: Props) {
  const [booking, setBooking] = useState(initial);
  const [qr, setQr] = useState(initialQr);

  // PayMongo redirects the customer back before the webhook necessarily lands.
  // Poll briefly rather than claiming success we cannot yet verify.
  useEffect(() => {
    if (booking.paid) return;
    let cancelled = false;
    let attempts = 0;

    const tick = async () => {
      attempts += 1;
      try {
        const data = await api<{ booking: { status: string; payments: { status: string; method: string | null; referenceNumber: string | null }[] }; qr: string | null }>(
          `/api/bookings/${booking.reference}`,
        );
        const paid = data.booking.payments.some((p) => p.status === "PAID");
        if (!cancelled && paid) {
          const payment = data.booking.payments.find((p) => p.status === "PAID");
          setBooking((b) => ({
            ...b,
            paid: true,
            status: data.booking.status,
            paymentMethod: payment?.method ?? b.paymentMethod,
            paymentReference: payment?.referenceNumber ?? b.paymentReference,
          }));
          setQr(data.qr);
          return;
        }
      } catch {
        // Transient network issues shouldn't break the page; try again.
      }
      if (!cancelled && attempts < 20) setTimeout(tick, 3000);
    };

    const timer = setTimeout(tick, 2000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [booking.paid, booking.reference]);

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-12 sm:py-16">
      <motion.div {...rise(0)} className="text-center">
        <DrawnCheck />
        <motion.h1
          {...rise(0.35)}
          className="mt-6 text-3xl font-bold tracking-tight text-white sm:text-4xl"
        >
          {booking.paid ? "Booking confirmed!" : "Verifying your payment…"}
        </motion.h1>
        <motion.p {...rise(0.45)} className="mt-2 text-sm text-white/50">
          {booking.paid ? (
            <>
              We&rsquo;ve emailed a copy to you. Show the QR code below at the front desk.
            </>
          ) : (
            <span className="inline-flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" aria-hidden />
              Your slot is reserved while we confirm with PayMongo. This page updates on its own.
            </span>
          )}
        </motion.p>
      </motion.div>

      <motion.div {...rise(0.55)} className="mt-8">
        <Card className="p-0">
          <div className="border-b border-white/10 px-6 py-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
              Booking number
            </p>
            <p className="mt-1 font-mono text-xl font-bold tracking-wider text-pickle-400">
              {booking.reference}
            </p>
          </div>

          <dl className="grid grid-cols-1 gap-x-8 gap-y-4 px-6 py-6 sm:grid-cols-2">
            {[
              ["Customer", booking.customerName],
              ["Court", booking.courtName],
              ["Date", booking.when],
              ["Time", booking.timeRange],
              ["Duration", `${booking.durationMins / 60} hour${booking.durationMins > 60 ? "s" : ""}`],
              ["Amount paid", peso(booking.total)],
              ["Payment method", booking.paymentMethod ?? (booking.paid ? "Online" : "Pending")],
              ["Payment reference", booking.paymentReference ?? "—"],
            ].map(([label, value], index) => (
              <motion.div key={label} {...rise(0.6 + index * 0.04)}>
                <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/35">
                  {label}
                </dt>
                <dd className="mt-0.5 text-sm font-medium text-white/90">{value}</dd>
              </motion.div>
            ))}
          </dl>

          {qr && (
            <motion.div
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.95, ease: [0.22, 1, 0.36, 1] }}
              className="border-t border-white/10 px-6 py-7 text-center"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qr}
                alt={`QR code for booking ${booking.reference}`}
                className="mx-auto size-44 rounded-xl bg-white p-2"
                width={176}
                height={176}
              />
              <p className="mt-3 text-xs text-white/40">
                Staff will scan this at check-in. Screenshots work too.
              </p>
            </motion.div>
          )}

          <div className="border-t border-white/10 px-6 py-5 text-sm text-white/55">
            <p className="font-semibold text-white/80">{facility.name}</p>
            <p className="mt-1.5 flex items-center gap-2">
              <MapPin size={14} className="text-pickle-500" aria-hidden />
              {facility.address}
            </p>
            <p className="mt-1 flex items-center gap-2">
              <Phone size={14} className="text-pickle-500" aria-hidden />
              {facility.phone}
            </p>
            <p className="mt-1 flex items-center gap-2">
              <Clock3 size={14} className="text-pickle-500" aria-hidden />
              Please arrive 10 minutes before your slot.
            </p>
          </div>
        </Card>
      </motion.div>

      <motion.div {...rise(0.75)} className="mt-6 flex flex-wrap justify-center gap-3">
        <Link href="/dashboard">
          <Button>My bookings</Button>
        </Link>
        <Link href="/book">
          <Button variant="secondary">Book another court</Button>
        </Link>
      </motion.div>
    </div>
  );
}
