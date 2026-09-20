import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/guard";
import { assertCsrf } from "@/lib/auth";
import { openPlaySessionSchema } from "@/lib/validation";
import { route, ok, readJson } from "@/lib/api";
import { manilaDateTimeToUtc, manilaStartOfDay } from "@/lib/time";
import { audit } from "@/lib/audit";
import { AppError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  await requirePermission("openplay:read");

  const sessions = await prisma.openPlaySession.findMany({
    orderBy: { startAt: "desc" },
    take: 60,
    include: {
      _count: {
        select: {
          players: { where: { status: { in: ["PENDING_PAYMENT", "REGISTERED", "CHECKED_IN"] } } },
          waitlist: { where: { status: "WAITING" } },
          groups: true,
        },
      },
    },
  });

  return ok({ sessions });
});

export const POST = route(async (request: Request) => {
  await assertCsrf(request);
  const admin = await requirePermission("openplay:write");
  const input = openPlaySessionSchema.parse(await readJson(request));

  if (input.endMin <= input.startMin) {
    throw new AppError("End time must be after the start time.", 400, "bad_range");
  }
  if (input.maxPlayers < input.minPlayers) {
    throw new AppError("Maximum players cannot be below the minimum.", 400, "bad_capacity");
  }

  const session = await prisma.openPlaySession.create({
    data: {
      title: input.title,
      date: manilaStartOfDay(input.date),
      startAt: manilaDateTimeToUtc(input.date, input.startMin),
      endAt: manilaDateTimeToUtc(input.date, input.endMin),
      skillLevel: input.skillLevel,
      pricePerPlayer: input.pricePerPlayer,
      courtCount: input.courtCount,
      playersPerCourt: input.playersPerCourt,
      minPlayers: input.minPlayers,
      maxPlayers: input.maxPlayers,
      rotationMins: input.rotationMins,
      status: input.status,
      notes: input.notes ?? null,
    },
  });

  await audit({
    userId: admin.id,
    actorEmail: admin.email,
    action: "openplay.create",
    entity: "OpenPlaySession",
    entityId: session.id,
    after: session,
  });

  return ok({ session }, { status: 201 });
});
