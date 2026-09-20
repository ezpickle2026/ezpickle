import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/guard";
import { assertCsrf } from "@/lib/auth";
import { saleSchema } from "@/lib/validation";
import { route, ok, readJson } from "@/lib/api";
import { reference as makeReference } from "@/lib/reference";
import { audit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import { manilaStartOfDay, manilaEndOfDay } from "@/lib/time";

export const dynamic = "force-dynamic";

export const GET = route(async (request: Request) => {
  await requirePermission("sales:read");
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const take = 50;

  const where = {
    ...(from || to
      ? {
          soldAt: {
            ...(from ? { gte: manilaStartOfDay(from) } : {}),
            ...(to ? { lt: manilaEndOfDay(to) } : {}),
          },
        }
      : {}),
    ...(searchParams.get("channel") ? { channel: searchParams.get("channel") as never } : {}),
  };

  const [sales, total] = await Promise.all([
    prisma.sale.findMany({
      where,
      include: {
        items: true,
        customer: { select: { fullName: true, email: true } },
        staff: { select: { fullName: true } },
      },
      orderBy: { soldAt: "desc" },
      skip: (page - 1) * take,
      take,
    }),
    prisma.sale.count({ where }),
  ]);

  return ok({ sales, total, page, pages: Math.ceil(total / take) });
});

/** Counter sale: merchandise, drinks, paddle rentals. Deducts stock atomically. */
export const POST = route(async (request: Request) => {
  await assertCsrf(request);
  const staff = await requirePermission("inventory:write");
  const input = saleSchema.parse(await readJson(request));

  const subtotal = input.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  if (input.discount > subtotal) {
    throw new AppError("Discount cannot exceed the sale total.", 400, "bad_discount");
  }

  const sale = await prisma.$transaction(async (tx) => {
    const created = await tx.sale.create({
      data: {
        reference: makeReference("SL", 8),
        channel: input.channel,
        customerId: input.customerId ?? null,
        staffId: staff.id,
        subtotal,
        discount: input.discount,
        total: subtotal - input.discount,
        paymentMethod: input.paymentMethod,
        items: {
          create: input.items.map((i) => ({
            productId: i.productId ?? null,
            description: i.description,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            total: i.unitPrice * i.quantity,
          })),
        },
      },
      include: { items: true },
    });

    for (const item of input.items) {
      if (!item.productId) continue;

      const product = await tx.product.findUnique({ where: { id: item.productId } });
      if (!product) continue;
      if (product.stock < item.quantity) {
        throw new AppError(
          `${product.name}: only ${product.stock} left in stock.`,
          409,
          "insufficient_stock",
        );
      }

      const balance = product.stock - item.quantity;
      await tx.product.update({ where: { id: product.id }, data: { stock: balance } });
      await tx.inventoryTransaction.create({
        data: {
          productId: product.id,
          type: input.channel === "RENTAL" ? "RENTAL_OUT" : "SALE",
          quantity: -item.quantity,
          balance,
          saleId: created.id,
          userId: staff.id,
          note: created.reference,
        },
      });
    }

    return created;
  });

  await audit({
    userId: staff.id,
    actorEmail: staff.email,
    action: "sale.create",
    entity: "Sale",
    entityId: sale.id,
    after: { reference: sale.reference, total: sale.total },
  });

  return ok({ sale }, { status: 201 });
});
