import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/guard";
import { assertCsrf } from "@/lib/auth";
import { pricingRuleSchema } from "@/lib/validation";
import { route, ok, readJson } from "@/lib/api";
import { audit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  await requirePermission("court:read");
  const rules = await prisma.pricingRule.findMany({
    orderBy: [{ priority: "desc" }, { startMin: "asc" }],
    include: { court: { select: { name: true } } },
  });
  return ok({ rules });
});

export const POST = route(async (request: Request) => {
  await assertCsrf(request);
  const admin = await requirePermission("court:write");
  const input = pricingRuleSchema.parse(await readJson(request));

  if (input.endMin <= input.startMin) {
    throw new AppError("The rule's end time must be after its start time.", 400, "bad_range");
  }

  const rule = await prisma.pricingRule.create({ data: input });

  await audit({
    userId: admin.id,
    actorEmail: admin.email,
    action: "pricing.create",
    entity: "PricingRule",
    entityId: rule.id,
    after: rule,
  });

  return ok({ rule }, { status: 201 });
});

export const PATCH = route(async (request: Request) => {
  await assertCsrf(request);
  const admin = await requirePermission("court:write");

  const { id, ...rest } = z
    .object({ id: z.string().min(1) })
    .passthrough()
    .parse(await readJson(request));

  const before = await prisma.pricingRule.findUnique({ where: { id } });
  const rule = await prisma.pricingRule.update({
    where: { id },
    data: pricingRuleSchema.partial().parse(rest),
  });

  await audit({
    userId: admin.id,
    actorEmail: admin.email,
    action: "pricing.update",
    entity: "PricingRule",
    entityId: id,
    before,
    after: rule,
  });

  return ok({ rule });
});

export const DELETE = route(async (request: Request) => {
  await assertCsrf(request);
  await requirePermission("court:write");
  const { id } = z.object({ id: z.string().min(1) }).parse(await readJson(request));
  await prisma.pricingRule.delete({ where: { id } });
  return ok({ removed: true });
});
