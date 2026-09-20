import { requireUser, assertCsrf } from "@/lib/auth";
import { joinWaitlist } from "@/lib/openplay";
import { route, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const POST = route(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  await assertCsrf(request);
  const { id } = await ctx.params;
  const user = await requireUser();

  const entry = await joinWaitlist({ sessionId: id, userId: user.id });
  const ahead = await prisma.waitlist.count({
    where: { sessionId: id, status: "WAITING", position: { lt: entry.position } },
  });

  return ok({ position: entry.position, ahead, status: entry.status }, { status: 201 });
});

export const DELETE = route(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  await assertCsrf(request);
  const { id } = await ctx.params;
  const user = await requireUser();

  await prisma.waitlist.updateMany({
    where: { sessionId: id, userId: user.id },
    data: { status: "CANCELLED" },
  });

  return ok({ removed: true });
});
