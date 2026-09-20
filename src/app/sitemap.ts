import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.APP_URL.replace(/\/$/, "");

  const sessions = await prisma.openPlaySession
    .findMany({
      where: { status: { in: ["OPEN", "FULL"] }, endAt: { gte: new Date() } },
      select: { id: true, updatedAt: true },
      take: 100,
    })
    .catch(() => []);

  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/book`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${base}/open-play`, changeFrequency: "daily", priority: 0.8 },
    ...sessions.map((s) => ({
      url: `${base}/open-play/${s.id}`,
      lastModified: s.updatedAt,
      changeFrequency: "daily" as const,
      priority: 0.5,
    })),
  ];
}
