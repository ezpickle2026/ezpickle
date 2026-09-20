import { describe, expect, it } from "vitest";
import type { PricingRule } from "@prisma/client";
import { applyDiscount, priceBooking } from "@/lib/pricing";
import { manilaDateTimeToUtc } from "@/lib/time";

function rule(partial: Partial<PricingRule> & { name: string; pricePerHour: number }): PricingRule {
  return {
    id: partial.name,
    name: partial.name,
    scope: "COURT_HOURLY",
    courtId: null,
    daysOfWeek: [],
    startMin: 0,
    endMin: 1440,
    dateFrom: null,
    dateTo: null,
    pricePerHour: partial.pricePerHour,
    priority: 0,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  } as PricingRule;
}

// 2026-09-21 is a Monday in Manila; 2026-09-26 is a Saturday.
const MONDAY = "2026-09-21";
const SATURDAY = "2026-09-26";

const OFF_PEAK = rule({
  name: "Off-peak weekday",
  daysOfWeek: [1, 2, 3, 4, 5],
  startMin: 6 * 60,
  endMin: 17 * 60,
  pricePerHour: 40000,
  priority: 10,
});

const PEAK = rule({
  name: "Peak weekday evening",
  daysOfWeek: [1, 2, 3, 4, 5],
  startMin: 17 * 60,
  endMin: 23 * 60,
  pricePerHour: 60000,
  priority: 20,
});

const WEEKEND = rule({
  name: "Weekend",
  daysOfWeek: [0, 6],
  startMin: 6 * 60,
  endMin: 23 * 60,
  pricePerHour: 70000,
  priority: 30,
});

const RULES = [OFF_PEAK, PEAK, WEEKEND];

function price(dateISO: string, startMin: number, durationMins: number, rules = RULES) {
  return priceBooking({
    start: manilaDateTimeToUtc(dateISO, startMin),
    end: manilaDateTimeToUtc(dateISO, startMin + durationMins),
    courtId: "court-1",
    fallbackHourly: 55000,
    rules,
  });
}

describe("priceBooking", () => {
  it("charges the off-peak rate for a weekday morning hour", () => {
    expect(price(MONDAY, 9 * 60, 60).total).toBe(40000);
  });

  it("charges the peak rate for a weekday evening hour", () => {
    expect(price(MONDAY, 19 * 60, 60).total).toBe(60000);
  });

  it("charges the weekend rate on a Saturday morning", () => {
    expect(price(SATURDAY, 9 * 60, 60).total).toBe(70000);
  });

  it("bills each portion separately when a booking straddles peak and off-peak", () => {
    // 16:00–18:00 on a Monday: one hour off-peak (₱400) + one hour peak (₱600).
    const result = price(MONDAY, 16 * 60, 120);
    expect(result.total).toBe(100000);
    expect(result.breakdown.map((b) => b.rate)).toEqual([40000, 40000, 60000, 60000]);
  });

  it("handles a 90-minute booking that crosses the boundary mid-slot", () => {
    // 16:30–18:00: 30 mins off-peak + 60 mins peak.
    expect(price(MONDAY, 16 * 60 + 30, 90).total).toBe(20000 + 60000);
  });

  it("falls back to the court's base rate when no rule matches", () => {
    // 05:00 is before any rule's window.
    expect(price(MONDAY, 5 * 60, 60).total).toBe(55000);
  });

  it("lets a higher-priority rule win over a lower one for the same window", () => {
    const special = rule({
      name: "Members promo hour",
      daysOfWeek: [1],
      startMin: 19 * 60,
      endMin: 20 * 60,
      pricePerHour: 30000,
      priority: 99,
    });
    expect(price(MONDAY, 19 * 60, 60, [...RULES, special]).total).toBe(30000);
  });

  it("prefers a court-specific rule over a facility-wide rule at equal priority", () => {
    const courtSpecific = rule({
      name: "Court 1 premium",
      courtId: "court-1",
      daysOfWeek: [1, 2, 3, 4, 5],
      startMin: 17 * 60,
      endMin: 23 * 60,
      pricePerHour: 80000,
      priority: 20,
    });
    expect(price(MONDAY, 19 * 60, 60, [...RULES, courtSpecific]).total).toBe(80000);
  });

  it("ignores inactive rules", () => {
    const disabledPeak = { ...PEAK, active: false };
    // Peak disabled and off-peak doesn't cover 19:00, so we fall back.
    expect(price(MONDAY, 19 * 60, 60, [OFF_PEAK, disabledPeak]).total).toBe(55000);
  });

  it("never returns a negative or fractional total", () => {
    const result = price(MONDAY, 9 * 60, 150);
    expect(Number.isInteger(result.total)).toBe(true);
    expect(result.total).toBeGreaterThan(0);
  });
});

describe("applyDiscount", () => {
  const percent = { discountType: "PERCENT" as const, value: 20, minPurchase: 0 };
  const fixed = { discountType: "FIXED" as const, value: 10000, minPurchase: 40000 };

  it("returns zero with no promo", () => {
    expect(applyDiscount(60000, null)).toBe(0);
  });

  it("applies a percentage discount", () => {
    expect(applyDiscount(60000, percent)).toBe(12000);
  });

  it("applies a fixed discount", () => {
    expect(applyDiscount(60000, fixed)).toBe(10000);
  });

  it("refuses a fixed discount below the minimum spend", () => {
    expect(applyDiscount(30000, fixed)).toBe(0);
  });

  it("never discounts more than the subtotal", () => {
    expect(applyDiscount(5000, fixed)).toBe(5000);
  });

  it("caps a percentage promo at 100%", () => {
    expect(applyDiscount(60000, { ...percent, value: 150 })).toBe(60000);
  });
});
