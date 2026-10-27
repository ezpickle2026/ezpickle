import "server-only";
import { prisma } from "./prisma";
import { Errors } from "./errors";

/**
 * DB-backed sliding window. Works on serverless where in-memory counters are
 * useless. Swap the store for Redis/Upstash when traffic warrants it.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number) {
  const since = new Date(Date.now() - windowSeconds * 1000);

  const hits = await prisma.rateLimitHit.count({ where: { key, createdAt: { gte: since } } });
  if (hits >= limit) throw Errors.rateLimited();

  await prisma.rateLimitHit.create({ data: { key } });

  // Opportunistic cleanup (~2% of calls) keeps the table small without a cron.
  if (Math.random() < 0.02) {
    await prisma.rateLimitHit.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - 864e5) } },
    });
  }
}
