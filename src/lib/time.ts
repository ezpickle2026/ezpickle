import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";
import { addMinutes, differenceInMinutes } from "date-fns";

/**
 * Everything in EzPickle is stored in UTC and rendered in the business
 * timezone. The server's own TZ is never trusted.
 */
export const BUSINESS_TZ = "Asia/Manila";

/** "2026-09-20" + 1110 (minutes from midnight) -> UTC Date */
export function manilaDateTimeToUtc(dateISO: string, minutesFromMidnight: number): Date {
  const [y, m, d] = dateISO.split("-").map(Number);
  const base = `${pad(y, 4)}-${pad(m)}-${pad(d)} ${pad(Math.floor(minutesFromMidnight / 60))}:${pad(
    minutesFromMidnight % 60,
  )}:00`;
  return fromZonedTime(base, BUSINESS_TZ);
}

/** Start of a Manila calendar day, as a UTC instant. */
export function manilaStartOfDay(dateISO: string): Date {
  return manilaDateTimeToUtc(dateISO, 0);
}

export function manilaEndOfDay(dateISO: string): Date {
  return addMinutes(manilaStartOfDay(dateISO), 24 * 60);
}

/** Minutes from Manila midnight for a UTC instant. */
export function minutesFromMidnight(date: Date): number {
  const z = toZonedTime(date, BUSINESS_TZ);
  return z.getHours() * 60 + z.getMinutes();
}

export function manilaDayOfWeek(date: Date): number {
  return toZonedTime(date, BUSINESS_TZ).getDay();
}

export function toManilaDateISO(date: Date): string {
  return formatInTimeZone(date, BUSINESS_TZ, "yyyy-MM-dd");
}

export function formatManila(date: Date, pattern = "MMM d, yyyy h:mm a"): string {
  return formatInTimeZone(date, BUSINESS_TZ, pattern);
}

export function formatTimeLabel(minutes: number): string {
  const h24 = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const suffix = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${pad(m)} ${suffix}`;
}

export function durationMinutes(start: Date, end: Date): number {
  return differenceInMinutes(end, start);
}

export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

export const nowUtc = () => new Date();
