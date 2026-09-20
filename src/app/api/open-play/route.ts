import { prisma } from "@/lib/prisma";
import { route, ok } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = route(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const includePast = searchParams.get("past") === "1";

  const sessions = await prisma.openPlaySession.findMany({
    where: {
      status: { in: ["OPEN", "FULL", "IN_PROGRESS"] },
      ...(includePast ? {} : { endAt: { gte: new Date() } }),
    },
    orderBy: { startAt: "asc" },
    take: 40,
    include: {
      _count: {
        select: {
          players: { where: { status: { in: ["PENDING_PAYMENT", "REGISTERED", "CHECKED_IN"] } } },
          waitlist: { where: { status: { in: ["WAITING", "OFFERED"] } } },
        },
      },
    },
  });

  return ok({
    sessions: sessions.map((s) => ({
      id: s.id,
      title: s.title,
      startAt: s.startAt,
      endAt: s.endAt,
      skillLevel: s.skillLevel,
      pricePerPlayer: s.pricePerPlayer,
      maxPlayers: s.maxPlayers,
      minPlayers: s.minPlayers,
      courtCount: s.courtCount,
      status: s.status,
      taken: s._count.players,
      waitlist: s._count.waitlist,
    })),
  });
});
