import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/guard";
import { assertCsrf } from "@/lib/auth";
import { courtSchema } from "@/lib/validation";
import { route, ok, readJson } from "@/lib/api";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  await requirePermission("court:read");
  const courts = await prisma.court.findMany({
    where: { deletedAt: null },
    orderBy: { number: "asc" },
    include: { images: { orderBy: { sortOrder: "asc" } } },
  });
  return ok({ courts });
});

export const POST = route(async (request: Request) => {
  await assertCsrf(request);
  const user = await requirePermission("court:write");
  const input = courtSchema.parse(await readJson(request));

  const court = await prisma.court.create({ data: input });
  await audit({
    userId: user.id,
    actorEmail: user.email,
    action: "court.create",
    entity: "Court",
    entityId: court.id,
    after: court,
  });

  return ok({ court }, { status: 201 });
});
