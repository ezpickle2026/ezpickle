import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/guard";
import { assertCsrf } from "@/lib/auth";
import { productSchema } from "@/lib/validation";
import { route, ok, readJson } from "@/lib/api";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export const GET = route(async (request: Request) => {
  await requirePermission("inventory:read");
  const { searchParams } = new URL(request.url);
  const lowOnly = searchParams.get("low") === "1";

  const products = await prisma.product.findMany({
    where: { deletedAt: null },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  const filtered = lowOnly ? products.filter((p) => p.stock <= p.minStock) : products;
  const inventoryValue = products.reduce((sum, p) => sum + p.stock * p.cost, 0);
  const retailValue = products.reduce((sum, p) => sum + p.stock * p.price, 0);

  return ok({
    products: filtered,
    summary: {
      skuCount: products.length,
      inventoryValue,
      retailValue,
      lowStock: products.filter((p) => p.stock <= p.minStock && p.stock > 0).length,
      outOfStock: products.filter((p) => p.stock === 0).length,
    },
  });
});

export const POST = route(async (request: Request) => {
  await assertCsrf(request);
  const staff = await requirePermission("inventory:write");
  const input = productSchema.parse(await readJson(request));

  const product = await prisma.product.create({ data: input });

  await audit({
    userId: staff.id,
    actorEmail: staff.email,
    action: "product.create",
    entity: "Product",
    entityId: product.id,
    after: product,
  });

  return ok({ product }, { status: 201 });
});
