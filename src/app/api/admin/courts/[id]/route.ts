import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/guard";
import { assertCsrf } from "@/lib/auth";
import { courtSchema } from "@/lib/validation";
import { route, ok, readJson } from "@/lib/api";
import { audit } from "@/lib/audit";
import { Errors } from "@/lib/errors";
import { AppError } from "@/lib/errors";
import { OCCUPYING } from "@/lib/booking";

export const PATCH = route(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  await assertCsrf(request);
  const { id } = await ctx.params;
  const user = await requirePermission("court:write");

  const before = await prisma.court.findUnique({ where: { id } });
  if (!before) throw Errors.notFound("That court");

  const input = courtSchema.partial().parse(await readJson(request));
  const court = await prisma.court.update({ where: { id }, data: input });

  await audit({
    userId: user.id,
    actorEmail: user.email,
    action: "court.update",
    entity: "Court",
    entityId: id,
    before,
    after: court,
  });

  return ok({ court });
});

/** Soft delete. Courts with live bookings are deactivated, never removed. */
export const DELETE = route(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  await assertCsrf(request);
  const { id } = await ctx.params;
  const user = await requirePermission("court:write");

  const upcoming = await prisma.booking.count({
    where: { courtId: id, startAt: { gte: new Date() }, status: { in: OCCUPYING } },
  });
  if (upcoming > 0) {
    throw new AppError(
      `This court has ${upcoming} upcoming booking(s). Deactivate it instead, or move those bookings first.`,
      409,
      "court_in_use",
    );
  }

  const court = await prisma.court.update({
    where: { id },
    data: { deletedAt: new Date(), active: false, bookable: false },
  });

  await audit({
    userId: user.id,
    actorEmail: user.email,
    action: "court.delete",
    entity: "Court",
    entityId: id,
    after: { deletedAt: court.deletedAt },
  });

  return ok({ deleted: true });
});
