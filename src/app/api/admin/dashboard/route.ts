import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/guard";
import { route, ok } from "@/lib/api";
import { manilaStartOfDay, manilaEndOfDay, toManilaDateISO } from "@/lib/time";
import { getSettings } from "@/lib/settings";
import { OCCUPYING } from "@/lib/booking";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  await requirePermission("booking:read");

  const today = toManilaDateISO(new Date());
  const dayStart = manilaStartOfDay(today);
  const dayEnd = manilaEndOfDay(today);
  const settings = await getSettings();
  const now = new Date();

  const [todayBookings, revenueAgg, courts, openPlay, pendingPayments, lowStock, upcoming, weekSales] =
    await Promise.all([
      prisma.booking.findMany({
        where: { startAt: { gte: dayStart, lt: dayEnd }, status: { in: OCCUPYING } },
        select: { id: true, durationMins: true, courtId: true, startAt: true, endAt: true },
      }),
      prisma.sale.aggregate({
        where: { soldAt: { gte: dayStart, lt: dayEnd }, status: "PAID" },
        _sum: { total: true },
        _count: true,
      }),
      prisma.court.findMany({
        where: { active: true, deletedAt: null },
        select: { id: true, name: true, number: true, status: true },
      }),
      prisma.openPlaySession.findMany({
        where: { startAt: { gte: dayStart, lt: dayEnd } },
        include: {
          _count: {
            select: { players: { where: { status: { in: ["REGISTERED", "CHECKED_IN"] } } } },
          },
        },
      }),
      prisma.booking.count({ where: { status: "PAYMENT_PENDING", holdExpiresAt: { gt: now } } }),
      prisma.$queryRaw<{ id: string; name: string; stock: number; minStock: number }[]>`
        SELECT id, name, stock, "minStock" FROM "Product"
        WHERE active = true AND "deletedAt" IS NULL AND stock <= "minStock"
        ORDER BY stock ASC LIMIT 10`,
      prisma.booking.findMany({
        where: { startAt: { gte: now }, status: { in: ["CONFIRMED", "PAYMENT_PENDING"] } },
        include: {
          court: { select: { name: true } },
          customer: { select: { fullName: true } },
        },
        orderBy: { startAt: "asc" },
        take: 8,
      }),
      prisma.sale.groupBy({
        by: ["channel"],
        where: { soldAt: { gte: new Date(now.getTime() - 7 * 864e5) }, status: "PAID" },
        _sum: { total: true },
      }),
    ]);

  const openMinutes = settings.closingMin - settings.openingMin;
  const capacityMins = courts.length * openMinutes;
  const bookedMins = todayBookings.reduce((sum, b) => sum + b.durationMins, 0);

  const occupiedNow = new Set(
    todayBookings.filter((b) => b.startAt <= now && b.endAt > now).map((b) => b.courtId),
  );

  const cancelledToday = await prisma.booking.count({
    where: { cancelledAt: { gte: dayStart, lt: dayEnd } },
  });

  return ok({
    date: today,
    revenueToday: revenueAgg._sum.total ?? 0,
    transactionsToday: revenueAgg._count,
    bookingsToday: todayBookings.length,
    utilization: capacityMins ? Math.round((bookedMins / capacityMins) * 100) : 0,
    courtsTotal: courts.length,
    courtsOccupied: occupiedNow.size,
    courtsAvailable: courts.filter(
      (c) => c.status === "AVAILABLE" && !occupiedNow.has(c.id),
    ).length,
    openPlayPlayers: openPlay.reduce((s, o) => s + o._count.players, 0),
    openPlaySessions: openPlay.length,
    pendingPayments,
    cancelledToday,
    lowStock,
    upcoming: upcoming.map((b) => ({
      id: b.id,
      reference: b.reference,
      court: b.court.name,
      customer: b.customer.fullName,
      startAt: b.startAt,
      endAt: b.endAt,
      status: b.status,
    })),
    revenueByChannel: weekSales.map((r) => ({ channel: r.channel, total: r._sum.total ?? 0 })),
  });
});
