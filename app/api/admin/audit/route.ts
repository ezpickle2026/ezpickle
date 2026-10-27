import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/guard";
import { route, ok } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = route(async (request: Request) => {
  await requirePermission("audit:read");
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const take = 50;

  const where = {
    ...(searchParams.get("entity") ? { entity: searchParams.get("entity")! } : {}),
    ...(searchParams.get("action") ? { action: searchParams.get("action")! } : {}),
  };

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { user: { select: { fullName: true, email: true, role: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * take,
      take,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return ok({ logs, total, page, pages: Math.ceil(total / take) });
});
