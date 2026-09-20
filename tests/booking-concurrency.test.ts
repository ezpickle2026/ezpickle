/**
 * Integration tests. These need a real Postgres with the schema AND the
 * exclusion constraints applied:
 *
 *   createdb ezpickle_test
 *   DATABASE_URL=postgresql://…/ezpickle_test npx prisma migrate deploy
 *   DATABASE_URL=postgresql://…/ezpickle_test npm run db:constraints
 *   TEST_DATABASE=1 DATABASE_URL=postgresql://…/ezpickle_test npm test
 *
 * Without TEST_DATABASE=1 they are skipped, so `npm test` stays green on a
 * machine with no database.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ENABLED = process.env.TEST_DATABASE === "1";
const suite = ENABLED ? describe : describe.skip;

suite("booking concurrency", async () => {
  const { prisma } = await import("@/lib/prisma");
  const { createHeldBooking, cancelBooking } = await import("@/lib/booking");
  const { releaseExpiredHolds } = await import("@/lib/holds");
  const { toManilaDateISO } = await import("@/lib/time");
  const bcrypt = (await import("bcryptjs")).default;

  let courtId = "";
  let customerA = "";
  let customerB = "";
  const tomorrow = toManilaDateISO(new Date(Date.now() + 864e5));

  beforeAll(async () => {
    const hash = await bcrypt.hash("Test!Password1", 4);

    const court = await prisma.court.create({
      data: {
        name: `Test Court ${Date.now()}`,
        number: 900 + Math.floor(Math.random() * 90),
        hourlyPrice: 50000,
        status: "AVAILABLE",
      },
    });
    courtId = court.id;

    const [a, b] = await Promise.all([
      prisma.user.create({
        data: { email: `a-${Date.now()}@test.local`, fullName: "Tester A", passwordHash: hash },
      }),
      prisma.user.create({
        data: { email: `b-${Date.now()}@test.local`, fullName: "Tester B", passwordHash: hash },
      }),
    ]);
    customerA = a.id;
    customerB = b.id;
  });

  afterAll(async () => {
    await prisma.booking.deleteMany({ where: { courtId } });
    await prisma.court.deleteMany({ where: { id: courtId } });
    await prisma.user.deleteMany({ where: { id: { in: [customerA, customerB] } } });
    await prisma.$disconnect();
  });

  it("allows a single booking on a free slot", async () => {
    const booking = await createHeldBooking({
      courtId,
      customerId: customerA,
      dateISO: tomorrow,
      startMin: 8 * 60,
      durationMins: 60,
    });

    expect(booking.reference).toMatch(/^EZP-/);
    expect(booking.status).toBe("PAYMENT_PENDING");
    expect(booking.holdExpiresAt).toBeInstanceOf(Date);
  });

  it("rejects an identical overlapping booking", async () => {
    await expect(
      createHeldBooking({
        courtId,
        customerId: customerB,
        dateISO: tomorrow,
        startMin: 8 * 60,
        durationMins: 60,
      }),
    ).rejects.toThrow();
  });

  it("rejects a partially overlapping booking", async () => {
    // 08:30–09:30 overlaps the 08:00–09:00 hold by thirty minutes.
    await expect(
      createHeldBooking({
        courtId,
        customerId: customerB,
        dateISO: tomorrow,
        startMin: 8 * 60 + 30,
        durationMins: 60,
      }),
    ).rejects.toThrow();
  });

  it("allows a booking that starts exactly when the other ends", async () => {
    const booking = await createHeldBooking({
      courtId,
      customerId: customerB,
      dateISO: tomorrow,
      startMin: 9 * 60,
      durationMins: 60,
    });
    expect(booking.startAt).toBeInstanceOf(Date);
  });

  it("lets only one of many simultaneous requests win the same slot", async () => {
    // The real test: fire ten concurrent attempts at one slot. The advisory
    // lock serialises them and the exclusion constraint is the final authority.
    const attempts = Array.from({ length: 10 }, (_, i) =>
      createHeldBooking({
        courtId,
        customerId: i % 2 === 0 ? customerA : customerB,
        dateISO: tomorrow,
        startMin: 14 * 60,
        durationMins: 60,
      }).then(
        (booking) => ({ ok: true as const, booking }),
        () => ({ ok: false as const }),
      ),
    );

    const results = await Promise.all(attempts);
    const winners = results.filter((r) => r.ok);

    expect(winners).toHaveLength(1);

    const rows = await prisma.booking.count({
      where: {
        courtId,
        status: { in: ["PAYMENT_PENDING", "CONFIRMED", "CHECKED_IN", "COMPLETED"] },
        startAt: { lt: new Date(`${tomorrow}T07:00:00.000Z`) },
        endAt: { gt: new Date(`${tomorrow}T06:00:00.000Z`) },
      },
    });
    expect(rows).toBeLessThanOrEqual(1);
  });

  it("frees the slot once a booking is cancelled", async () => {
    const first = await createHeldBooking({
      courtId,
      customerId: customerA,
      dateISO: tomorrow,
      startMin: 16 * 60,
      durationMins: 60,
    });

    await cancelBooking({
      bookingId: first.id,
      actorId: customerA,
      isStaff: true,
      reason: "Test cancel",
    });

    const second = await createHeldBooking({
      courtId,
      customerId: customerB,
      dateISO: tomorrow,
      startMin: 16 * 60,
      durationMins: 60,
    });
    expect(second.id).not.toBe(first.id);
  });

  it("frees the slot once the hold expires and the sweeper runs", async () => {
    const held = await createHeldBooking({
      courtId,
      customerId: customerA,
      dateISO: tomorrow,
      startMin: 20 * 60,
      durationMins: 60,
    });

    // Backdate the hold so the sweeper considers it lapsed.
    await prisma.booking.update({
      where: { id: held.id },
      data: { holdExpiresAt: new Date(Date.now() - 60_000) },
    });

    const result = await releaseExpiredHolds();
    expect(result.bookings).toBeGreaterThanOrEqual(1);

    const after = await prisma.booking.findUniqueOrThrow({ where: { id: held.id } });
    expect(after.status).toBe("EXPIRED");

    // And someone else can now take it.
    const retaken = await createHeldBooking({
      courtId,
      customerId: customerB,
      dateISO: tomorrow,
      startMin: 20 * 60,
      durationMins: 60,
    });
    expect(retaken.id).not.toBe(held.id);
  });

  it("is idempotent when the sweeper runs twice", async () => {
    await releaseExpiredHolds();
    const second = await releaseExpiredHolds();
    expect(second.bookings).toBe(0);
  });

  it("refuses a booking in the past", async () => {
    const yesterday = toManilaDateISO(new Date(Date.now() - 864e5));
    await expect(
      createHeldBooking({
        courtId,
        customerId: customerA,
        dateISO: yesterday,
        startMin: 9 * 60,
        durationMins: 60,
      }),
    ).rejects.toThrow();
  });
});
