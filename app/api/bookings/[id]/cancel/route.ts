import { requireUser, assertCsrf } from "@/lib/auth";
import { STAFF_ROLES } from "@/lib/rbac";
import { cancelBooking } from "@/lib/booking";
import { route, ok, readJson } from "@/lib/api";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { formatManila } from "@/lib/time";
import { z } from "zod";

export const POST = route(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  await assertCsrf(request);
  const { id } = await ctx.params;
  const user = await requireUser();

  const body = z
    .object({ reason: z.string().trim().max(200).optional() })
    .parse(await readJson(request));

  const before = await prisma.booking.findUnique({ where: { id } });

  const booking = await cancelBooking({
    bookingId: id,
    actorId: user.id,
    isStaff: STAFF_ROLES.includes(user.role),
    reason: body.reason,
  });

  await audit({
    userId: user.id,
    actorEmail: user.email,
    action: "booking.cancel",
    entity: "Booking",
    entityId: booking.id,
    before: { status: before?.status },
    after: { status: booking.status, reason: booking.cancelReason },
  });

  const customer = await prisma.user.findUnique({ where: { id: booking.customerId } });
  if (customer) {
    await notify({
      userId: customer.id,
      to: customer.email,
      template: "booking_cancelled",
      payload: {
        reference: booking.reference,
        court: booking.court.name,
        when: formatManila(booking.startAt),
      },
    });
  }

  return ok({ id: booking.id, status: booking.status });
});
