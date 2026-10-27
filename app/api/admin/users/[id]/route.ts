import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/guard";
import { assertCsrf, revokeAllSessions } from "@/lib/auth";
import { userSchema } from "@/lib/validation";
import { route, ok, readJson } from "@/lib/api";
import { hashPassword } from "@/lib/password";
import { audit } from "@/lib/audit";
import { AppError, Errors } from "@/lib/errors";

export const PATCH = route(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  await assertCsrf(request);
  const { id } = await ctx.params;
  const admin = await requirePermission("user:manage");

  const before = await prisma.user.findUnique({ where: { id } });
  if (!before) throw Errors.notFound("That user");

  const input = userSchema.partial().parse(await readJson(request));

  // Guard rail: never let the last super admin be demoted or locked out.
  if (before.role === "SUPER_ADMIN" && (input.role !== undefined || input.status === "DISABLED")) {
    const remaining = await prisma.user.count({
      where: { role: "SUPER_ADMIN", status: "ACTIVE", deletedAt: null, id: { not: id } },
    });
    if (remaining === 0) {
      throw new AppError(
        "This is the only active Super Admin. Promote someone else first.",
        409,
        "last_super_admin",
      );
    }
  }

  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(input.fullName ? { fullName: input.fullName } : {}),
      ...(input.email ? { email: input.email } : {}),
      ...(input.mobile !== undefined ? { mobile: input.mobile } : {}),
      ...(input.role ? { role: input.role } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.password ? { passwordHash: await hashPassword(input.password) } : {}),
    },
    select: { id: true, email: true, fullName: true, role: true, status: true },
  });

  // Role change or disable takes effect immediately, not at next login.
  if (input.role || input.status === "DISABLED" || input.password) {
    await revokeAllSessions(id);
  }

  await audit({
    userId: admin.id,
    actorEmail: admin.email,
    action: "user.update",
    entity: "User",
    entityId: id,
    before: { role: before.role, status: before.status, email: before.email },
    after: { role: user.role, status: user.status, email: user.email },
  });

  return ok({ user });
});

export const DELETE = route(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  await assertCsrf(request);
  const { id } = await ctx.params;
  const admin = await requirePermission("user:manage");

  if (id === admin.id) throw new AppError("You cannot remove your own account.", 409, "self_delete");

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) throw Errors.notFound("That user");

  if (target.role === "SUPER_ADMIN") {
    const remaining = await prisma.user.count({
      where: { role: "SUPER_ADMIN", status: "ACTIVE", deletedAt: null, id: { not: id } },
    });
    if (remaining === 0) {
      throw new AppError("You cannot remove the only Super Admin.", 409, "last_super_admin");
    }
  }

  await prisma.user.update({
    where: { id },
    data: { deletedAt: new Date(), status: "DISABLED" },
  });
  await revokeAllSessions(id);

  await audit({
    userId: admin.id,
    actorEmail: admin.email,
    action: "user.delete",
    entity: "User",
    entityId: id,
    before: { email: target.email, role: target.role },
  });

  return ok({ removed: true });
});
