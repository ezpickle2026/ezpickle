import type { Metadata } from "next";
import { getSettings } from "@/lib/settings";
import { getSessionUser } from "@/lib/auth";
import { toManilaDateISO } from "@/lib/time";
import { BookingWizard } from "@/components/booking-wizard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Book a Court",
  description:
    "Check live pickleball court availability at EzPickle and reserve your slot in under a minute. Pay securely with GCash, Maya or card.",
  alternates: { canonical: "/book" },
};

export default async function BookPage() {
  const [settings, user] = await Promise.all([getSettings(), getSessionUser()]);

  // Duration options are derived from configured booking rules — nothing here
  // is hardcoded, so changing the rules in Admin → Settings changes the UI.
  const durations: number[] = [];
  for (
    let mins = settings.minBookingMins;
    mins <= settings.maxBookingMins;
    mins += settings.bookingIntervalMins
  ) {
    durations.push(mins);
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:py-14">
      <header className="mb-8">
        <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-pickle-400">
          Reserve
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Book a court
        </h1>
        <p className="mt-2 max-w-xl text-sm text-white/50">
          Availability updates live. Your slot is held for {settings.holdMinutes} minutes once you
          continue to payment.
        </p>
      </header>

      <BookingWizard
        initialDate={toManilaDateISO(new Date())}
        durations={durations}
        signedIn={Boolean(user)}
      />
    </div>
  );
}
