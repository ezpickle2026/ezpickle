import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/guard";
import { assertCsrf } from "@/lib/auth";
import { adminBookingSchema } from "@/lib/validation";
import { route, ok, readJson } from "@/lib/api";
import { createHeldBooking } from "@/lib/booking";
import { manilaStartOfDay, manilaEndOfDay } from "@/lib/time";
import { audit } from "@/lib/audit";
import { hashPassword } from "@/lib/password";
import { reference as makeReference } from "@/lib/reference";
import { randomBytes } from "node:crypto";

export const dynamic = "force-dynamic";

export const GET = route(async (request: Request) => {
  await requirePermission("booking:read");
  const { searchParams } = new URL(request.url);

  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const take = Math.min(100, Number(searchParams.get("perPage") ?? 25));
  const q = searchParams.get("q")?.trim();

  const where: Prisma.BookingWhereInput = {};

  const date = searchParams.get("date");
  if (date) where.startAt = { gte: manilaStartOfDay(date), lt: manilaEndOfDay(date) };

  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (from || to) {
    where.startAt = {
      ...(from ? { gte: manilaStartOfDay(from) } : {}),
      ...(to ? { lt: manilaEndOfDay(to) } : {}),
    };
  }

  const courtId = searchParams.get("courtId");
  if (courtId) where.courtId = courtId;

  const status = searchParams.get("status");
  if (status) where.status = status as Prisma.BookingWhereInput["status"];

  const paymentStatus = searchParams.get("paymentStatus");
  if (paymentStatus) {
    where.payments = { some: { status: paymentStatus as never } };
  }

  if (q) {
    where.OR = [
      { reference: { contains: q, mode: "insensitive" } },
      { customer: { fullName: { contains: q, mode: "insensitive" } } },
      { customer: { email: { contains: q, mode: "insensitive" } } },
    ];
  }

  const [bookings, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      include: {
        court: { select: { name: true, number: true } },
        customer: { select: { id: true, fullName: true, email: true, mobile: true } },
        payments: { select: { status: true, amount: true, method: true, referenceNumber: true } },
      },
      orderBy: { startAt: "desc" },
      skip: (page - 1) * take,
      take,
    }),
    prisma.booking.count({ where }),
  ]);

  return ok({ bookings, total, page, perPage: take, pages: Math.ceil(total / take) });
});

/** Manual / walk-in booking. Creates the customer record if they are new. */
export const POST = route(async (request: Request) => {
  await assertCsrf(request);
  const staff = await requirePermission("booking:write");
  const input = adminBookingSchema.parse(await readJson(request));

  let customerId = input.customerId;
  if (!customerId) {
    if (!input.customerEmail || !input.customerName) {
      return ok({ error: "Provide an existing customer or a name and email." }, { status: 400 });
    }
    const existing = await prisma.user.findUnique({ where: { email: input.customerEmail } });
    customerId =
      existing?.id ??
      (
        await prisma.user.create({
          data: {
            email: input.customerEmail,
            fullName: input.customerName,
            mobile: input.customerMobile ?? null,
            // Walk-ins get an unusable password; they set a real one via reset.
            passwordHash: await hashPassword(randomBytes(32).toString("hex")),
            role: "CUSTOMER",
          },
        })
      ).id;
  }

  const booking = await createHeldBooking({
    courtId: input.courtId,
    customerId,
    dateISO: input.date,
    startMin: input.startMin,
    durationMins: input.durationMins,
    promoCode: input.promoCode,
    notes: input.notes,
    createdById: staff.id,
    source: "WALK_IN",
    skipHold: input.markPaid,
  });

  if (input.markPaid) {
    await prisma.$transaction([
      prisma.payment.create({
        data: {
          purpose: "COURT_BOOKING",
          bookingId: booking.id,
          amount: booking.total,
          status: "PAID",
          provider: input.paymentMethod,
          method: input.paymentMethod,
          referenceNumber: makeReference("MAN", 8),
          paidAt: new Date(),
        },
      }),
      prisma.sale.create({
        data: {
          reference: makeReference("SL", 8),
          channel: "COURT_BOOKING",
          customerId,
          staffId: staff.id,
          bookingId: booking.id,
          subtotal: booking.subtotal,
          discount: booking.discount,
          total: booking.total,
          paymentMethod: input.paymentMethod,
          items: {
            create: {
              description: `${booking.court.name} · ${booking.durationMins / 60}h`,
              quantity: 1,
              unitPrice: booking.subtotal,
              total: booking.subtotal,
            },
          },
        },
      }),
    ]);
  }

  await audit({
    userId: staff.id,
    actorEmail: staff.email,
    action: "booking.create_manual",
    entity: "Booking",
    entityId: booking.id,
    after: { reference: booking.reference, total: booking.total, paid: input.markPaid },
  });

  return ok({ booking }, { status: 201 });
});
