import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { STAFF_ROLES } from "@/lib/rbac";
import { route, ok } from "@/lib/api";
import { Errors } from "@/lib/errors";
import { bookingQrDataUrl } from "@/lib/qr";

export const dynamic = "force-dynamic";

export const GET = route(async (_request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const user = await requireUser();

  const booking = await prisma.booking.findFirst({
    where: { OR: [{ id }, { reference: id }] },
    include: {
      court: true,
      customer: { select: { id: true, fullName: true, email: true, mobile: true } },
      payments: true,
    },
  });
  if (!booking) throw Errors.notFound("That booking");

  const isStaff = STAFF_ROLES.includes(user.role);
  if (!isStaff && booking.customerId !== user.id) throw Errors.forbidden();

  const showQr = ["CONFIRMED", "CHECKED_IN", "COMPLETED"].includes(booking.status);

  return ok({
    booking,
    qr: showQr ? await bookingQrDataUrl(booking.id, booking.reference) : null,
  });
});
