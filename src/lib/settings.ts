import "server-only";
import { prisma } from "./prisma";

export type BusinessSettings = {
  businessName: string;
  logoUrl: string;
  email: string;
  phone: string;
  address: string;
  timezone: string;
  currency: string;
  openingMin: number; // minutes from midnight, Asia/Manila
  closingMin: number;
  bookingIntervalMins: number;
  minBookingMins: number;
  maxBookingMins: number;
  maxAdvanceDays: number;
  minCancelNoticeMins: number;
  holdMinutes: number; // payment deadline for a court hold
  bufferMins: number; // gap enforced between bookings on a court
  openPlayHoldMinutes: number;
  waitlistOfferMinutes: number;
  cancellationPolicy: string;
};

export const DEFAULT_SETTINGS: BusinessSettings = {
  businessName: "EzPickle",
  logoUrl: "/logo.png",
  email: "hello@ezpickle.ph",
  phone: "+63 917 000 0000",
  address: "Quezon City, Metro Manila, Philippines",
  timezone: "Asia/Manila",
  currency: "PHP",
  openingMin: 6 * 60,
  closingMin: 23 * 60,
  bookingIntervalMins: 30,
  minBookingMins: 60,
  maxBookingMins: 180,
  maxAdvanceDays: 30,
  minCancelNoticeMins: 240,
  holdMinutes: 15,
  bufferMins: 0,
  openPlayHoldMinutes: 15,
  waitlistOfferMinutes: 30,
  cancellationPolicy:
    "Bookings may be cancelled for a full refund up to 4 hours before start time. Later cancellations are non-refundable.",
};

const KEY = "business";

export async function getSettings(): Promise<BusinessSettings> {
  const row = await prisma.setting.findUnique({ where: { key: KEY } });
  if (!row) return DEFAULT_SETTINGS;
  return { ...DEFAULT_SETTINGS, ...(row.value as Partial<BusinessSettings>) };
}

export async function updateSettings(patch: Partial<BusinessSettings>): Promise<BusinessSettings> {
  const current = await getSettings();
  const next = { ...current, ...patch };
  await prisma.setting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: next as never },
    update: { value: next as never },
  });
  return next;
}
