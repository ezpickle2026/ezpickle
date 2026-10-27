import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/guard";
import { assertCsrf } from "@/lib/auth";
import { promoSchema } from "@/lib/validation";
import { route, ok, readJson } from "@/lib/api";
import { audit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  await requirePermission("promo:write");
  const promos = await prisma.promoCode.findMany({ orderBy: { createdAt: "desc" } });
  return ok({ promos });
});

export const POST = route(async (request: Request) => {
  await assertCsrf(request);
  const admin = await requirePermission("promo:write");
  const input = promoSchema.parse(await readJson(request));

  if (input.discountType === "PERCENT" && input.value > 100) {
    throw new AppError("A percentage discount cannot exceed 100.", 400, "bad_percent");
  }

  const promo = await prisma.promoCode.create({
    data: {
      ...input,
      startsAt: input.startsAt ? new Date(input.startsAt) : null,
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
    },
  });

  await audit({
    userId: admin.id,
    actorEmail: admin.email,
    action: "promo.create",
    entity: "PromoCode",
    entityId: promo.id,
    after: promo,
  });

  return ok({ promo }, { status: 201 });
});

export const PATCH = route(async (request: Request) => {
  await assertCsrf(request);
  await requirePermission("promo:write");

  const { id, ...rest } = z
    .object({ id: z.string().min(1) })
    .passthrough()
    .parse(await readJson(request));

  const input = promoSchema.partial().parse(rest);
  const promo = await prisma.promoCode.update({
    where: { id },
    data: {
      ...input,
      ...(input.startsAt !== undefined
        ? { startsAt: input.startsAt ? new Date(input.startsAt) : null }
        : {}),
      ...(input.endsAt !== undefined
        ? { endsAt: input.endsAt ? new Date(input.endsAt) : null }
        : {}),
    },
  });

  return ok({ promo });
});
