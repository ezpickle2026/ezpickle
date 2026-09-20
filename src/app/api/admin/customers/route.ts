import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/guard";
import { route, ok } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = route(async (request: Request) => {
  await requirePermission("customer:read");
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const take = 25;

  const where = {
    role: "CUSTOMER" as const,
    deletedAt: null,
    ...(q
      ? {
          OR: [
            { fullName: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
            { mobile: { contains: q } },
          ],
        }
      : {}),
  };

  const [customers, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        fullName: true,
        email: true,
        mobile: true,
        status: true,
        createdAt: true,
        _count: { select: { bookings: true, openPlayPlayers: true } },
        bookings: { select: { startAt: true }, orderBy: { startAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * take,
      take,
    }),
    prisma.user.count({ where }),
  ]);

  // Lifetime value, computed from settled sales rather than booking totals.
  const spend = await prisma.sale.groupBy({
    by: ["customerId"],
    where: { customerId: { in: customers.map((c) => c.id) }, status: "PAID" },
    _sum: { total: true },
  });
  const spendMap = new Map(spend.map((s) => [s.customerId, s._sum.total ?? 0]));

  return ok({
    customers: customers.map((c) => ({
      id: c.id,
      fullName: c.fullName,
      email: c.email,
      mobile: c.mobile,
      status: c.status,
      totalBookings: c._count.bookings,
      openPlaySessions: c._count.openPlayPlayers,
      lastBooking: c.bookings[0]?.startAt ?? null,
      totalSpend: spendMap.get(c.id) ?? 0,
    })),
    total,
    page,
    pages: Math.ceil(total / take),
  });
});
