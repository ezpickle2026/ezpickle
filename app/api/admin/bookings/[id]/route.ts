import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/guard";
import { assertCsrf } from "@/lib/auth";
import { route, ok, readJson } from "@/lib/api";
import { audit } from "@/lib/audit";
import { Errors } from "@/lib/errors";
import { publish } from "@/lib/realtime";

const patchSchema = z.object({
  status: z
    .enum(["CONFIRMED", "CHECKED_IN", "COMPLETED", "NO_SHOW", "CANCELLED", "REFUNDED"])
    .optional(),
  notes: z.string().trim().max(400).optional().nullable(),
  customerId: z.string().min(1).optional(),
});

export const PATCH = route(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  await assertCsrf(request);
  const { id } = await ctx.params;
  const staff = await requirePermission("booking:write");

  const before = await prisma.booking.findUnique({ where: { id } });
  if (!before) throw Errors.notFound("That booking");

  const input = patchSchema.parse(await readJson(request));

  const booking = await prisma.booking.update({
    where: { id },
    data: {
      ...(input.status ? { status: input.status } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.customerId ? { customerId: input.customerId } : {}),
      ...(input.status === "CANCELLED" ? { cancelledAt: new Date() } : {}),
    },
    include: { court: true },
  });

  await audit({
    userId: staff.id,
    actorEmail: staff.email,
    action: "booking.update",
    entity: "Booking",
    entityId: id,
    before: { status: before.status, notes: before.notes, customerId: before.customerId },
    after: { status: booking.status, notes: booking.notes, customerId: booking.customerId },
  });

  if (input.status && ["CANCELLED", "NO_SHOW", "REFUNDED"].includes(input.status)) {
    await publish("availability", {
      type: "slot_changed",
      courtId: booking.courtId,
      date: booking.startAt.toISOString().slice(0, 10),
      state: "AVAILABLE",
    });
  }

  return ok({ booking });
});
