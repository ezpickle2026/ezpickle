import type { PricingRule } from "@prisma/client";
import { manilaDayOfWeek, minutesFromMidnight } from "./time";

/**
 * Pricing is never hardcoded. The engine walks the booking minute-by-minute
 * (in booking-interval steps) so a session that straddles off-peak and peak is
 * charged correctly for each portion.
 */
export function priceBooking(params: {
  start: Date;
  end: Date;
  courtId: string;
  fallbackHourly: number;
  rules: PricingRule[];
  stepMins?: number;
}): { total: number; breakdown: { from: number; to: number; rate: number; amount: number }[] } {
  const { start, end, courtId, fallbackHourly, rules } = params;
  const step = params.stepMins ?? 30;

  const applicable = rules
    .filter((r) => r.active && r.scope === "COURT_HOURLY")
    .filter((r) => !r.courtId || r.courtId === courtId)
    .filter((r) => !r.dateFrom || r.dateFrom <= start)
    .filter((r) => !r.dateTo || r.dateTo >= start)
    // Court-specific rules outrank facility-wide rules at equal priority.
    .sort((a, b) => b.priority - a.priority || Number(!!b.courtId) - Number(!!a.courtId));

  const breakdown: { from: number; to: number; rate: number; amount: number }[] = [];
  let total = 0;

  for (let t = start.getTime(); t < end.getTime(); t += step * 60_000) {
    const slotStart = new Date(t);
    const minute = minutesFromMidnight(slotStart);
    const dow = manilaDayOfWeek(slotStart);
    const slotMins = Math.min(step, (end.getTime() - t) / 60_000);

    const rule = applicable.find(
      (r) =>
        (r.daysOfWeek.length === 0 || r.daysOfWeek.includes(dow)) &&
        minute >= r.startMin &&
        minute < r.endMin,
    );

    const hourly = rule?.pricePerHour ?? fallbackHourly;
    const amount = Math.round((hourly * slotMins) / 60);

    const last = breakdown[breakdown.length - 1];
    if (last && last.rate === hourly && last.to === minute) {
      last.to = minute + slotMins;
      last.amount += amount;
    } else {
      breakdown.push({ from: minute, to: minute + slotMins, rate: hourly, amount });
    }
    total += amount;
  }

  return { total, breakdown };
}

export function applyDiscount(
  subtotal: number,
  promo: { discountType: "PERCENT" | "FIXED"; value: number; minPurchase: number } | null,
): number {
  if (!promo) return 0;
  if (subtotal < promo.minPurchase) return 0;
  const raw =
    promo.discountType === "PERCENT"
      ? Math.round((subtotal * Math.min(promo.value, 100)) / 100)
      : promo.value;
  return Math.min(raw, subtotal);
}
