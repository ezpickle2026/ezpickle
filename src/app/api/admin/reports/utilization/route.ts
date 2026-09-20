import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/guard";
import { route, ok } from "@/lib/api";
import { getSettings } from "@/lib/settings";
import { OCCUPYING } from "@/lib/booking";
import { minutesFromMidnight, toManilaDateISO } from "@/lib/time";
import { resolveRange, csv } from "../sales/route";

export const dynamic = "force-dynamic";

export const GET = route(async (request: Request) => {
  await requirePermission("report:read");
  const { searchParams } = new URL(request.url);
  const { from, to } = resolveRange(
    searchParams.get("range") ?? "this_month",
    searchParams.get("from"),
    searchParams.get("to"),
  );

  const settings = await getSettings();
  const openMinsPerDay = settings.closingMin - settings.openingMin;
  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 864e5));

  const [courts, bookings] = await Promise.all([
    prisma.court.findMany({
      where: { active: true, deletedAt: null },
      orderBy: { number: "asc" },
      select: { id: true, name: true, number: true },
    }),
    prisma.booking.findMany({
      where: { startAt: { gte: from, lt: to }, status: { in: OCCUPYING } },
      select: { courtId: true, durationMins: true, startAt: true, total: true },
    }),
  ]);

  const revenueRows = await prisma.$queryRaw<{ courtId: string; total: bigint }[]>`
    SELECT b."courtId" AS "courtId", SUM(s.total)::bigint AS total
    FROM "Sale" s JOIN "Booking" b ON b.id = s."bookingId"
    WHERE s."soldAt" >= ${from} AND s."soldAt" < ${to} AND s.status = 'PAID'
    GROUP BY b."courtId"`;
  const revenueMap = new Map(revenueRows.map((r) => [r.courtId, Number(r.total)]));

  const perCourt = courts.map((court) => {
    const mine = bookings.filter((b) => b.courtId === court.id);
    const bookedMins = mine.reduce((s, b) => s + b.durationMins, 0);
    const availableMins = openMinsPerDay * days;
    return {
      courtId: court.id,
      court: court.name,
      number: court.number,
      bookedHours: Math.round((bookedMins / 60) * 10) / 10,
      availableHours: Math.round((availableMins / 60) * 10) / 10,
      utilization: availableMins ? Math.round((bookedMins / availableMins) * 100) : 0,
      bookings: mine.length,
      revenue: revenueMap.get(court.id) ?? 0,
    };
  });

  // Peak hours across the whole range.
  const hourly = new Map<number, number>();
  const daily = new Map<string, number>();
  for (const b of bookings) {
    const hour = Math.floor(minutesFromMidnight(b.startAt) / 60);
    hourly.set(hour, (hourly.get(hour) ?? 0) + 1);
    const key = toManilaDateISO(b.startAt);
    daily.set(key, (daily.get(key) ?? 0) + b.durationMins);
  }

  if (searchParams.get("format") === "csv") {
    return csv(
      [
        ["Court", "Booked hours", "Available hours", "Utilization %", "Bookings", "Revenue"],
        ...perCourt.map((c) => [
          c.court,
          c.bookedHours,
          c.availableHours,
          c.utilization,
          c.bookings,
          (c.revenue / 100).toFixed(2),
        ]),
      ],
      "ezpickle-utilization.csv",
    );
  }

  return ok({
    range: { from, to, days },
    courts: perCourt,
    overall: {
      utilization: perCourt.length
        ? Math.round(perCourt.reduce((s, c) => s + c.utilization, 0) / perCourt.length)
        : 0,
      bookings: bookings.length,
    },
    peakHours: [...hourly.entries()]
      .sort(([a], [b]) => a - b)
      .map(([hour, count]) => ({ hour, count })),
    dailyUtilization: [...daily.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, mins]) => ({
        date,
        utilization: Math.round((mins / (openMinsPerDay * courts.length)) * 100),
      })),
  });
});
