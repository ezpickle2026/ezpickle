import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/guard";
import { route, ok } from "@/lib/api";
import { manilaStartOfDay, manilaEndOfDay, toManilaDateISO } from "@/lib/time";

export const dynamic = "force-dynamic";

/** Sales report with CSV export. `?format=csv` streams a download. */
export const GET = route(async (request: Request) => {
  await requirePermission("report:read");
  const { searchParams } = new URL(request.url);

  const { from, to } = resolveRange(
    searchParams.get("range") ?? "this_month",
    searchParams.get("from"),
    searchParams.get("to"),
  );

  const [sales, byChannel, refunds] = await Promise.all([
    prisma.sale.findMany({
      where: { soldAt: { gte: from, lt: to }, status: "PAID" },
      include: { items: true, customer: { select: { fullName: true } } },
      orderBy: { soldAt: "asc" },
    }),
    prisma.sale.groupBy({
      by: ["channel"],
      where: { soldAt: { gte: from, lt: to }, status: "PAID" },
      _sum: { total: true, discount: true },
      _count: true,
    }),
    prisma.sale.aggregate({
      where: { soldAt: { gte: from, lt: to }, status: "REFUNDED" },
      _sum: { total: true },
      _count: true,
    }),
  ]);

  const gross = sales.reduce((s, x) => s + x.subtotal, 0);
  const discounts = sales.reduce((s, x) => s + x.discount, 0);
  const net = sales.reduce((s, x) => s + x.total, 0);

  // Daily series in Manila days.
  const seriesMap = new Map<string, number>();
  for (const sale of sales) {
    const key = toManilaDateISO(sale.soldAt);
    seriesMap.set(key, (seriesMap.get(key) ?? 0) + sale.total);
  }
  const series = [...seriesMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, total]) => ({ date, total }));

  const byMethod = await prisma.sale.groupBy({
    by: ["paymentMethod"],
    where: { soldAt: { gte: from, lt: to }, status: "PAID" },
    _sum: { total: true },
  });

  const byCourt = await prisma.$queryRaw<{ court: string; total: bigint }[]>`
    SELECT c.name AS court, SUM(s.total)::bigint AS total
    FROM "Sale" s
    JOIN "Booking" b ON b.id = s."bookingId"
    JOIN "Court" c ON c.id = b."courtId"
    WHERE s."soldAt" >= ${from} AND s."soldAt" < ${to} AND s.status = 'PAID'
    GROUP BY c.name ORDER BY total DESC`;

  const payload = {
    range: { from, to },
    gross,
    discounts,
    net,
    transactions: sales.length,
    refunds: { amount: refunds._sum.total ?? 0, count: refunds._count },
    byChannel: byChannel.map((c) => ({
      channel: c.channel,
      total: c._sum.total ?? 0,
      discount: c._sum.discount ?? 0,
      count: c._count,
    })),
    byMethod: byMethod.map((m) => ({ method: m.paymentMethod, total: m._sum.total ?? 0 })),
    byCourt: byCourt.map((r) => ({ court: r.court, total: Number(r.total) })),
    series,
  };

  if (searchParams.get("format") === "csv") {
    const rows = [
      ["Reference", "Date", "Channel", "Customer", "Subtotal", "Discount", "Total", "Method"],
      ...sales.map((s) => [
        s.reference,
        toManilaDateISO(s.soldAt),
        s.channel,
        s.customer?.fullName ?? "Walk-in",
        (s.subtotal / 100).toFixed(2),
        (s.discount / 100).toFixed(2),
        (s.total / 100).toFixed(2),
        s.paymentMethod,
      ]),
    ];
    return csv(rows, `ezpickle-sales-${toManilaDateISO(from)}.csv`);
  }

  return ok(payload);
});

export function resolveRange(range: string, fromParam?: string | null, toParam?: string | null) {
  const today = toManilaDateISO(new Date());
  const day = 864e5;

  switch (range) {
    case "today":
      return { from: manilaStartOfDay(today), to: manilaEndOfDay(today) };
    case "yesterday": {
      const y = toManilaDateISO(new Date(Date.now() - day));
      return { from: manilaStartOfDay(y), to: manilaEndOfDay(y) };
    }
    case "this_week": {
      const start = toManilaDateISO(new Date(Date.now() - 6 * day));
      return { from: manilaStartOfDay(start), to: manilaEndOfDay(today) };
    }
    case "last_month": {
      const d = new Date();
      const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
      const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0));
      return {
        from: manilaStartOfDay(first.toISOString().slice(0, 10)),
        to: manilaEndOfDay(last.toISOString().slice(0, 10)),
      };
    }
    case "custom":
      return {
        from: manilaStartOfDay(fromParam ?? today),
        to: manilaEndOfDay(toParam ?? today),
      };
    case "this_month":
    default: {
      const first = `${today.slice(0, 8)}01`;
      return { from: manilaStartOfDay(first), to: manilaEndOfDay(today) };
    }
  }
}

export function csv(rows: (string | number)[][], filename: string) {
  const body = rows
    .map((row) =>
      row
        .map((cell) => {
          const value = String(cell ?? "");
          return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(","),
    )
    .join("\n");

  return new Response(`\uFEFF${body}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
