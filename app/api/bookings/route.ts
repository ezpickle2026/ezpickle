import { prisma } from "@/lib/prisma";
import { requireUser, assertCsrf } from "@/lib/auth";
import { createBookingSchema } from "@/lib/validation";
import { createHeldBooking } from "@/lib/booking";
import { route, ok, readJson } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { notify } from "@/lib/notifications";
import { getSettings } from "@/lib/settings";
import { formatManila } from "@/lib/time";
import { peso } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const GET = route(async (request: Request) => {
  const user = await requireUser();
  const { searchParams } = new URL(request.url);
  const scope = searchParams.get("scope") ?? "upcoming";

  const now = new Date();
  const where =
    scope === "past"
      ? { customerId: user.id, startAt: { lt: now } }
      : { customerId: user.id, startAt: { gte: now }, status: { notIn: ["EXPIRED" as const] } };

  const bookings = await prisma.booking.findMany({
    where,
    include: {
      court: { select: { name: true, number: true } },
      payments: { select: { status: true, method: true, amount: true, paidAt: true } },
    },
    orderBy: { startAt: scope === "past" ? "desc" : "asc" },
    take: 100,
  });

  return ok({ bookings });
});

export const POST = route(async (request: Request) => {
  await assertCsrf(request);
  const user = await requireUser();
  await rateLimit(`booking:create:${user.id}`, 12, 600);

  const input = createBookingSchema.parse(await readJson(request));

  const booking = await createHeldBooking({
    courtId: input.courtId,
    customerId: user.id,
    dateISO: input.date,
    startMin: input.startMin,
    durationMins: input.durationMins,
    promoCode: input.promoCode,
    notes: input.notes,
    source: "ONLINE",
  });

  const settings = await getSettings();

  await notify({
    userId: user.id,
    to: user.email,
    template: "booking_created",
    payload: {
      reference: booking.reference,
      court: booking.court.name,
      when: formatManila(booking.startAt),
      amount: peso(booking.total),
      payWithin: `${settings.holdMinutes} minutes`,
    },
  });

  return ok(
    {
      id: booking.id,
      reference: booking.reference,
      total: booking.total,
      holdExpiresAt: booking.holdExpiresAt,
      court: booking.court.name,
      startAt: booking.startAt,
      endAt: booking.endAt,
    },
    { status: 201 },
  );
});
