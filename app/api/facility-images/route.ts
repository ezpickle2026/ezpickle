import { prisma } from "@/lib/prisma";
import { route, ok } from "@/lib/api";

export const revalidate = 60;

export const GET = route(async () => {
  const images = await prisma.facilityImage.findMany({
    where: { active: true },
    orderBy: [{ featured: "desc" }, { sortOrder: "asc" }],
    take: 24,
  });
  return ok({ images });
});
