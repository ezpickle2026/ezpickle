import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/guard";
import { assertCsrf } from "@/lib/auth";
import { route, ok, readJson } from "@/lib/api";
import { refundPayment } from "@/lib/paymongo";
import { audit } from "@/lib/audit";
import { Errors, AppError } from "@/lib/errors";

export const POST = route(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  await assertCsrf(request);
  const { id } = await ctx.params;
  const staff = await requirePermission("booking:refund");

  const body = z
    .object({
      amount: z.number().int().min(1).optional(),
      reason: z
        .enum(["duplicate", "fraudulent", "requested_by_customer", "others"])
        .default("requested_by_customer"),
    })
    .parse(await readJson(request));

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { payments: { where: { status: "PAID" }, orderBy: { paidAt: "desc" } } },
  });
  if (!booking) throw Errors.notFound("That booking");

  const payment = booking.payments[0];
  if (!payment) throw new AppError("There is no captured payment to refund.", 409, "nothing_to_refund");

  const amount = body.amount ?? payment.amount - payment.refundedAmount;
  if (amount <= 0) throw new AppError("This payment is already fully refunded.", 409, "already_refunded");

  if (payment.paymentId) {
    await refundPayment({
      paymentId: payment.paymentId,
      amount,
      reason: body.reason,
      idempotencyKey: `refund:${payment.id}:${amount}`,
    });
  }

  const fullyRefunded = payment.refundedAmount + amount >= payment.amount;

  await prisma.$transaction([
    prisma.payment.update({
      where: { id: payment.id },
      data: {
        refundedAmount: { increment: amount },
        status: fullyRefunded ? "REFUNDED" : payment.status,
      },
    }),
    prisma.booking.update({
      where: { id },
      data: { status: fullyRefunded ? "REFUNDED" : booking.status },
    }),
    ...(booking.id
      ? [
          prisma.sale.updateMany({
            where: { bookingId: booking.id },
            data: { status: fullyRefunded ? "REFUNDED" : "PAID" },
          }),
        ]
      : []),
  ]);

  await audit({
    userId: staff.id,
    actorEmail: staff.email,
    action: "payment.refund",
    entity: "Payment",
    entityId: payment.id,
    after: { amount, reason: body.reason, manual: !payment.paymentId },
  });

  return ok({
    refunded: amount,
    manual: !payment.paymentId,
    note: payment.paymentId
      ? undefined
      : "This booking was paid outside PayMongo — record the cash refund at the desk.",
  });
});
