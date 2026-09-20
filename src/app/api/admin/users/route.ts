import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/guard";
import { assertCsrf } from "@/lib/auth";
import { userSchema } from "@/lib/validation";
import { route, ok, readJson } from "@/lib/api";
import { hashPassword } from "@/lib/password";
import { audit } from "@/lib/audit";
import { AppError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export const GET = route(async (request: Request) => {
  await requirePermission("user:manage");
  const { searchParams } = new URL(request.url);
  const role = searchParams.get("role");

  const users = await prisma.user.findMany({
    where: {
      deletedAt: null,
      ...(role ? { role: role as never } : { role: { in: ["SUPER_ADMIN", "ADMIN", "STAFF"] } }),
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      mobile: true,
      role: true,
      status: true,
      lastLoginAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return ok({ users });
});

export const POST = route(async (request: Request) => {
  await assertCsrf(request);
  const admin = await requirePermission("user:manage");
  const input = userSchema.parse(await readJson(request));

  if (!input.password) throw new AppError("A temporary password is required.", 400, "password_required");

  const user = await prisma.user.create({
    data: {
      email: input.email,
      fullName: input.fullName,
      mobile: input.mobile ?? null,
      role: input.role,
      status: input.status,
      passwordHash: await hashPassword(input.password),
    },
    select: { id: true, email: true, fullName: true, role: true, status: true },
  });

  await audit({
    userId: admin.id,
    actorEmail: admin.email,
    action: "user.create",
    entity: "User",
    entityId: user.id,
    after: { email: user.email, role: user.role },
  });

  return ok({ user }, { status: 201 });
});
