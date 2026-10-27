import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/guard";
import { assertCsrf } from "@/lib/auth";
import { stockMovementSchema } from "@/lib/validation";
import { route, ok, readJson } from "@/lib/api";
import { audit } from "@/lib/audit";
import { AppError, Errors } from "@/lib/errors";

/**
 * Every stock change is a ledger entry, never a bare UPDATE. The running
 * balance is written alongside so the history reconciles even if someone
 * edits a product later.
 */
export const POST = route(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  await assertCsrf(request);
  const { id } = await ctx.params;
  const staff = await requirePermission("inventory:write");
  const input = stockMovementSchema.parse(await readJson(request));

  const result = await prisma.$transaction(async (tx) => {
    const product = await tx.product.findUnique({ where: { id } });
    if (!product) throw Errors.notFound("That product");

    const balance = product.stock + input.quantity;
    if (balance < 0) {
      throw new AppError(
        `Only ${product.stock} in stock — cannot remove ${Math.abs(input.quantity)}.`,
        409,
        "insufficient_stock",
      );
    }

    const updated = await tx.product.update({ where: { id }, data: { stock: balance } });

    const movement = await tx.inventoryTransaction.create({
      data: {
        productId: id,
        type: input.type,
        quantity: input.quantity,
        unitCost: input.unitCost ?? null,
        balance,
        note: input.note ?? null,
        userId: staff.id,
      },
    });

    return { product: updated, movement };
  });

  await audit({
    userId: staff.id,
    actorEmail: staff.email,
    action: "inventory.movement",
    entity: "Product",
    entityId: id,
    after: { type: input.type, quantity: input.quantity, balance: result.product.stock },
  });

  return ok(result, { status: 201 });
});
