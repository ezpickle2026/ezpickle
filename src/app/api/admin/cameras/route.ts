import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/guard";
import { assertCsrf } from "@/lib/auth";
import { cameraSchema } from "@/lib/validation";
import { route, ok, readJson } from "@/lib/api";
import { audit } from "@/lib/audit";
import { Errors } from "@/lib/errors";
import { isOnline, newCameraKey } from "@/lib/picklecam";

export const dynamic = "force-dynamic";

const select = {
  id: true,
  courtId: true,
  name: true,
  liveUrl: true,
  liveType: true,
  ingestKeyHint: true,
  active: true,
  lastSeenAt: true,
  createdAt: true,
  court: { select: { name: true, number: true } },
  _count: { select: { recordings: true } },
} as const;

export const GET = route(async () => {
  await requirePermission("cam:read");
  const cameras = await prisma.courtCamera.findMany({
    orderBy: [{ court: { number: "asc" } }, { name: "asc" }],
    select,
  });
  const now = new Date();
  return ok({ cameras: cameras.map((c) => ({ ...c, online: c.active && isOnline(c.lastSeenAt, now) })) });
});

/** Adds a camera and returns its connection key. The key is shown only once. */
export const POST = route(async (request: Request) => {
  await assertCsrf(request);
  const user = await requirePermission("cam:write");
  const input = cameraSchema.parse(await readJson(request));

  const court = await prisma.court.findFirst({ where: { id: input.courtId, deletedAt: null } });
  if (!court) throw Errors.notFound("That court");

  const key = newCameraKey();
  const camera = await prisma.courtCamera.create({
    data: { ...input, liveUrl: input.liveUrl ?? null, ingestKeyHash: key.hash, ingestKeyHint: key.hint },
    select,
  });

  await audit({
    userId: user.id,
    actorEmail: user.email,
    action: "camera.create",
    entity: "CourtCamera",
    entityId: camera.id,
    after: { courtId: camera.courtId, name: camera.name, liveUrl: camera.liveUrl },
  });

  return ok({ camera: { ...camera, online: false }, key: key.key }, { status: 201 });
});
