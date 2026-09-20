import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/guard";
import { assertCsrf } from "@/lib/auth";
import { productSchema } from "@/lib/validation";
import { route, ok, readJson } from "@/lib/api";
import { audit } from "@/lib/audit";
import { Errors } from "@/lib/errors";

export const GET = route(async (_r: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  await requirePermission("inventory:read");

  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      transactions: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { user: { select: { fullName: true } } },
      },
    },
  });
  if (!product) throw Errors.notFound("That product");

  return ok({ product });
});

export const PATCH = route(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  await assertCsrf(request);
  const { id } = await ctx.params;
  const staff = await requirePermission("inventory:write");

  const before = await prisma.product.findUnique({ where: { id } });
  if (!before) throw Errors.notFound("That product");

  const input = productSchema.partial().parse(await readJson(request));
  const product = await prisma.product.update({ where: { id }, data: input });

  await audit({
    userId: staff.id,
    actorEmail: staff.email,
    action: "product.update",
    entity: "Product",
    entityId: id,
    before,
    after: product,
  });

  return ok({ product });
});

export const DELETE = route(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  await assertCsrf(request);
  const { id } = await ctx.params;
  const staff = await requirePermission("inventory:write");

  // Soft delete keeps historical sale line items intact.
  await prisma.product.update({
    where: { id },
    data: { deletedAt: new Date(), active: false },
  });

  await audit({
    userId: staff.id,
    actorEmail: staff.email,
    action: "product.delete",
    entity: "Product",
    entityId: id,
  });

  return ok({ removed: true });
});
