import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/guard";
import { assertCsrf } from "@/lib/auth";
import { facilityImageSchema } from "@/lib/validation";
import { route, ok, readJson } from "@/lib/api";
import { audit } from "@/lib/audit";
import { z } from "zod";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  await requirePermission("media:write");
  const images = await prisma.facilityImage.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });
  return ok({ images });
});

export const POST = route(async (request: Request) => {
  await assertCsrf(request);
  const admin = await requirePermission("media:write");
  const input = facilityImageSchema.parse(await readJson(request));

  const image = await prisma.facilityImage.create({ data: input });

  await audit({
    userId: admin.id,
    actorEmail: admin.email,
    action: "media.create",
    entity: "FacilityImage",
    entityId: image.id,
    after: image,
  });

  return ok({ image }, { status: 201 });
});

/** Bulk reorder from drag-and-drop in the media manager. */
export const PUT = route(async (request: Request) => {
  await assertCsrf(request);
  await requirePermission("media:write");

  const { order } = z
    .object({ order: z.array(z.object({ id: z.string(), sortOrder: z.number().int() })).max(200) })
    .parse(await readJson(request));

  await prisma.$transaction(
    order.map((item) =>
      prisma.facilityImage.update({ where: { id: item.id }, data: { sortOrder: item.sortOrder } }),
    ),
  );

  return ok({ reordered: order.length });
});
