import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/guard";
import { route, ok } from "@/lib/api";
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

  const [products, movements, bestSellers] = await Promise.all([
    prisma.product.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
    prisma.inventoryTransaction.findMany({
      where: { createdAt: { gte: from, lt: to } },
      include: {
        product: { select: { name: true, sku: true } },
        user: { select: { fullName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    prisma.saleItem.groupBy({
      by: ["productId"],
      where: { productId: { not: null }, sale: { soldAt: { gte: from, lt: to }, status: "PAID" } },
      _sum: { quantity: true, total: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 10,
    }),
  ]);

  const nameMap = new Map(products.map((p) => [p.id, p.name]));

  if (searchParams.get("format") === "csv") {
    return csv(
      [
        ["SKU", "Product", "Category", "Stock", "Min stock", "Cost", "Price", "Stock value"],
        ...products.map((p) => [
          p.sku,
          p.name,
          p.category,
          p.stock,
          p.minStock,
          (p.cost / 100).toFixed(2),
          (p.price / 100).toFixed(2),
          ((p.stock * p.cost) / 100).toFixed(2),
        ]),
      ],
      "ezpickle-inventory.csv",
    );
  }

  return ok({
    range: { from, to },
    summary: {
      skuCount: products.length,
      inventoryValue: products.reduce((s, p) => s + p.stock * p.cost, 0),
      retailValue: products.reduce((s, p) => s + p.stock * p.price, 0),
      lowStock: products.filter((p) => p.stock > 0 && p.stock <= p.minStock).length,
      outOfStock: products.filter((p) => p.stock === 0).length,
    },
    products,
    lowStock: products.filter((p) => p.stock <= p.minStock),
    movements,
    bestSellers: bestSellers.map((b) => ({
      productId: b.productId,
      name: nameMap.get(b.productId!) ?? "Unknown",
      quantity: b._sum.quantity ?? 0,
      revenue: b._sum.total ?? 0,
    })),
  });
});
