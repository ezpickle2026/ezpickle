/**
 * Seed data for local development and demos.
 *
 * Refuses to run against a production database unless SEED_ENABLED=true is set
 * explicitly, because it deletes and recreates the demo dataset.
 *
 *   npm run db:seed
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { manilaDateTimeToUtc, manilaStartOfDay, toManilaDateISO } from "../src/lib/time";
import { reference } from "../src/lib/reference";
import { DEFAULT_SETTINGS } from "../src/lib/settings";

const prisma = new PrismaClient();

const SEED_PASSWORD = process.env.SEED_PASSWORD ?? "EzPickle!2026";

function guard() {
  const allowed = process.env.SEED_ENABLED === "true";
  const isProd = process.env.NODE_ENV === "production";
  if (isProd && !allowed) {
    throw new Error(
      "Refusing to seed a production database. Set SEED_ENABLED=true if you really mean it.",
    );
  }
}

/** Offset a Manila calendar date by N days and return YYYY-MM-DD. */
function dayOffset(days: number): string {
  return toManilaDateISO(new Date(Date.now() + days * 864e5));
}

async function main() {
  guard();
  console.log("Seeding EzPickle…");

  // ---- Clean slate -------------------------------------------------------
  // Order matters: children before parents, because several relations are
  // restrict-on-delete by design.
  await prisma.$transaction([
    prisma.saleItem.deleteMany(),
    prisma.sale.deleteMany(),
    prisma.inventoryTransaction.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.webhookEvent.deleteMany(),
    prisma.playerPairHistory.deleteMany(),
    prisma.waitlist.deleteMany(),
    prisma.openPlayPlayer.deleteMany(),
    prisma.openPlayGroup.deleteMany(),
    prisma.openPlaySession.deleteMany(),
    prisma.booking.deleteMany(),
    prisma.courtBlock.deleteMany(),
    prisma.courtImage.deleteMany(),
    prisma.pricingRule.deleteMany(),
    prisma.promoCode.deleteMany(),
    prisma.facilityImage.deleteMany(),
    prisma.product.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.rateLimitHit.deleteMany(),
    prisma.session.deleteMany(),
    prisma.court.deleteMany(),
    prisma.user.deleteMany(),
    prisma.setting.deleteMany(),
  ]);

  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 12);

  // ---- Settings ----------------------------------------------------------
  await prisma.setting.create({
    data: { key: "business", value: DEFAULT_SETTINGS as never },
  });

  // ---- Staff -------------------------------------------------------------
  const [superAdmin, admin, staff] = await Promise.all([
    prisma.user.create({
      data: {
        email: "owner@ezpickle.ph",
        fullName: "Marisol Reyes",
        mobile: "09171234567",
        passwordHash,
        role: "SUPER_ADMIN",
      },
    }),
    prisma.user.create({
      data: {
        email: "manager@ezpickle.ph",
        fullName: "Diego Santos",
        mobile: "09181234567",
        passwordHash,
        role: "ADMIN",
      },
    }),
    prisma.user.create({
      data: {
        email: "frontdesk@ezpickle.ph",
        fullName: "Joy Villanueva",
        mobile: "09191234567",
        passwordHash,
        role: "STAFF",
      },
    }),
  ]);

  // ---- Customers ---------------------------------------------------------
  const customerSeeds = [
    ["ana.cruz@example.com", "Ana Cruz", "09171112222", 3.5],
    ["ben.tan@example.com", "Ben Tan", "09172223333", 4.0],
    ["carlo.dizon@example.com", "Carlo Dizon", "09173334444", 3.0],
    ["dana.lim@example.com", "Dana Lim", "09174445555", 4.5],
    ["edgar.ramos@example.com", "Edgar Ramos", "09175556666", 2.5],
    ["fiona.go@example.com", "Fiona Go", "09176667777", 3.5],
    ["gabby.uy@example.com", "Gabby Uy", "09177778888", 5.0],
    ["hannah.sy@example.com", "Hannah Sy", "09178889999", 3.0],
    ["ivan.perez@example.com", "Ivan Perez", "09179990000", 4.0],
    ["jules.mendoza@example.com", "Jules Mendoza", "09170001111", 3.5],
    ["kim.navarro@example.com", "Kim Navarro", "09170112233", 4.5],
    ["lara.ocampo@example.com", "Lara Ocampo", "09170223344", 2.5],
  ] as const;

  const customers = await Promise.all(
    customerSeeds.map(([email, fullName, mobile]) =>
      prisma.user.create({
        data: { email, fullName, mobile, passwordHash, role: "CUSTOMER" },
      }),
    ),
  );

  // ---- Courts ------------------------------------------------------------
  const courtSeeds = [
    {
      name: "Court 1 — Center",
      number: 1,
      description: "Championship court with tournament-grade lighting and spectator seating.",
      indoor: true,
      surface: "CUSHIONED" as const,
      hourlyPrice: 70000,
      amenities: ["Spectator seating", "Tournament lighting", "Air-conditioned", "Video recording"],
    },
    {
      name: "Court 2 — North",
      number: 2,
      description: "Indoor acrylic court, the regulars' favourite for evening doubles.",
      indoor: true,
      surface: "ACRYLIC" as const,
      hourlyPrice: 60000,
      amenities: ["Air-conditioned", "Ball machine available", "Bench seating"],
    },
    {
      name: "Court 3 — South",
      number: 3,
      description: "Indoor acrylic court with a slightly quicker surface.",
      indoor: true,
      surface: "ACRYLIC" as const,
      hourlyPrice: 60000,
      amenities: ["Air-conditioned", "Bench seating"],
    },
    {
      name: "Court 4 — Garden",
      number: 4,
      description: "Covered outdoor court. Open air, shaded, great for morning play.",
      indoor: false,
      surface: "CONCRETE" as const,
      hourlyPrice: 50000,
      amenities: ["Covered roof", "Natural ventilation", "Water station"],
    },
  ];

  const courts = await Promise.all(
    courtSeeds.map((court) =>
      prisma.court.create({
        data: {
          ...court,
          status: "AVAILABLE",
          active: true,
          bookable: true,
          images: {
            create: [
              {
                url: `https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=1200&q=80&court=${court.number}`,
                title: court.name,
                sortOrder: 0,
                featured: true,
              },
            ],
          },
        },
      }),
    ),
  );

  // ---- Pricing rules -----------------------------------------------------
  // Deliberately layered: the weekend rule outranks peak, which outranks
  // off-peak. Nothing is hardcoded in the pricing engine itself.
  await prisma.pricingRule.createMany({
    data: [
      {
        name: "Off-peak weekday",
        scope: "COURT_HOURLY",
        daysOfWeek: [1, 2, 3, 4, 5],
        startMin: 6 * 60,
        endMin: 17 * 60,
        pricePerHour: 40000,
        priority: 10,
      },
      {
        name: "Peak weekday evening",
        scope: "COURT_HOURLY",
        daysOfWeek: [1, 2, 3, 4, 5],
        startMin: 17 * 60,
        endMin: 23 * 60,
        pricePerHour: 60000,
        priority: 20,
      },
      {
        name: "Weekend rate",
        scope: "COURT_HOURLY",
        daysOfWeek: [0, 6],
        startMin: 6 * 60,
        endMin: 23 * 60,
        pricePerHour: 70000,
        priority: 30,
      },
      {
        name: "Open Play seat",
        scope: "OPEN_PLAY",
        daysOfWeek: [],
        startMin: 0,
        endMin: 1440,
        pricePerHour: 25000,
        priority: 10,
      },
    ],
  });

  // ---- Facility images ---------------------------------------------------
  const gallery = [
    ["Main playing hall", "Four courts under tournament-grade lighting."],
    ["Pro shop", "Paddles, balls, grips and everything you forgot at home."],
    ["Lounge", "Somewhere to catch your breath between games."],
    ["Court 1 at night", "Evening league play on the centre court."],
    ["Garden court", "Covered outdoor play, best in the morning."],
    ["Locker rooms", "Showers, lockers and towel service."],
  ];

  await prisma.facilityImage.createMany({
    data: gallery.map(([title, caption], index) => ({
      url: `https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=1600&q=80&i=${index}`,
      title,
      caption,
      sortOrder: index,
      featured: index < 3,
      active: true,
    })),
  });

  // ---- Products ----------------------------------------------------------
  const products = await Promise.all(
    [
      ["Indoor Pickleball (3-pack)", "BALL-IND-3", "Balls", 24000, 45000, 60, 12],
      ["Outdoor Pickleball (3-pack)", "BALL-OUT-3", "Balls", 26000, 48000, 40, 12],
      ["Carbon Fibre Paddle", "PAD-CF-01", "Paddles", 280000, 495000, 8, 3],
      ["Beginner Paddle", "PAD-BEG-01", "Paddles", 90000, 175000, 14, 4],
      ["Overgrip (3-pack)", "GRIP-OG-3", "Accessories", 15000, 29000, 30, 8],
      ["Sports Towel", "ACC-TWL-01", "Accessories", 12000, 25000, 25, 6],
      ["Bottled Water 500ml", "DRK-WTR-500", "Drinks", 1200, 3500, 120, 36],
      ["Isotonic Drink 500ml", "DRK-ISO-500", "Drinks", 3000, 7500, 72, 24],
      ["Energy Bar", "SNK-BAR-01", "Snacks", 3500, 8000, 48, 12],
      ["EzPickle Dri-fit Shirt", "APP-SHT-01", "Apparel", 35000, 75000, 22, 5],
      ["Paddle Rental (per session)", "RNT-PAD-01", "Rentals", 0, 15000, 16, 4],
      ["Court Shoes (size 42)", "APP-SHO-42", "Apparel", 190000, 320000, 2, 3],
    ].map(([name, sku, category, cost, price, stock, minStock]) =>
      prisma.product.create({
        data: {
          name: name as string,
          sku: sku as string,
          category: category as string,
          cost: cost as number,
          price: price as number,
          stock: stock as number,
          minStock: minStock as number,
          rentable: (sku as string).startsWith("RNT"),
          supplier: "Manila Racquet Supply",
        },
      }),
    ),
  );

  // Opening stock ledger, so inventory reports have history to show.
  await prisma.inventoryTransaction.createMany({
    data: products.map((product) => ({
      productId: product.id,
      type: "PURCHASE" as const,
      quantity: product.stock,
      unitCost: product.cost,
      balance: product.stock,
      userId: admin.id,
      note: "Opening stock",
    })),
  });

  // ---- Promo codes -------------------------------------------------------
  await prisma.promoCode.createMany({
    data: [
      {
        code: "LAUNCH20",
        description: "20% off your first booking",
        discountType: "PERCENT",
        value: 20,
        perUserLimit: 1,
        usageLimit: 500,
        active: true,
      },
      {
        code: "MORNING100",
        description: "₱100 off any morning session",
        discountType: "FIXED",
        value: 10000,
        minPurchase: 40000,
        active: true,
      },
    ],
  });

  // ---- Bookings ----------------------------------------------------------
  // A spread of past (completed), today and upcoming bookings so the dashboard,
  // calendar and reports all have something real to render.
  const bookingPlan: { dayOffset: number; courtIndex: number; startMin: number; durationMins: number; status: "COMPLETED" | "CONFIRMED" | "PAYMENT_PENDING" | "CANCELLED" }[] = [
    { dayOffset: -6, courtIndex: 0, startMin: 19 * 60, durationMins: 60, status: "COMPLETED" },
    { dayOffset: -6, courtIndex: 1, startMin: 19 * 60, durationMins: 90, status: "COMPLETED" },
    { dayOffset: -5, courtIndex: 2, startMin: 8 * 60, durationMins: 60, status: "COMPLETED" },
    { dayOffset: -4, courtIndex: 0, startMin: 18 * 60, durationMins: 120, status: "COMPLETED" },
    { dayOffset: -3, courtIndex: 3, startMin: 7 * 60, durationMins: 60, status: "COMPLETED" },
    { dayOffset: -3, courtIndex: 1, startMin: 20 * 60, durationMins: 60, status: "CANCELLED" },
    { dayOffset: -2, courtIndex: 2, startMin: 17 * 60, durationMins: 90, status: "COMPLETED" },
    { dayOffset: -1, courtIndex: 0, startMin: 19 * 60, durationMins: 60, status: "COMPLETED" },
    { dayOffset: 0, courtIndex: 1, startMin: 18 * 60, durationMins: 60, status: "CONFIRMED" },
    { dayOffset: 0, courtIndex: 2, startMin: 20 * 60, durationMins: 90, status: "CONFIRMED" },
    { dayOffset: 1, courtIndex: 0, startMin: 19 * 60, durationMins: 60, status: "CONFIRMED" },
    { dayOffset: 1, courtIndex: 3, startMin: 8 * 60, durationMins: 120, status: "CONFIRMED" },
    { dayOffset: 2, courtIndex: 1, startMin: 17 * 60, durationMins: 60, status: "CONFIRMED" },
    { dayOffset: 2, courtIndex: 2, startMin: 18 * 60, durationMins: 60, status: "PAYMENT_PENDING" },
    { dayOffset: 4, courtIndex: 0, startMin: 10 * 60, durationMins: 90, status: "CONFIRMED" },
    { dayOffset: 6, courtIndex: 3, startMin: 16 * 60, durationMins: 60, status: "CONFIRMED" },
  ];

  const hourlyFor = (startMin: number, dow: number) => {
    if (dow === 0 || dow === 6) return 70000;
    return startMin >= 17 * 60 ? 60000 : 40000;
  };

  for (const [index, plan] of bookingPlan.entries()) {
    const dateISO = dayOffset(plan.dayOffset);
    const startAt = manilaDateTimeToUtc(dateISO, plan.startMin);
    const endAt = manilaDateTimeToUtc(dateISO, plan.startMin + plan.durationMins);
    const dow = new Date(`${dateISO}T12:00:00Z`).getUTCDay();
    const subtotal = Math.round((hourlyFor(plan.startMin, dow) * plan.durationMins) / 60);
    const customer = customers[index % customers.length];
    const paid = plan.status === "COMPLETED" || plan.status === "CONFIRMED";

    const booking = await prisma.booking.create({
      data: {
        reference: reference("EZP", 6),
        courtId: courts[plan.courtIndex].id,
        customerId: customer.id,
        startAt,
        endAt,
        durationMins: plan.durationMins,
        subtotal,
        discount: 0,
        total: subtotal,
        status: plan.status,
        source: index % 5 === 0 ? "WALK_IN" : "ONLINE",
        holdExpiresAt:
          plan.status === "PAYMENT_PENDING" ? new Date(Date.now() + 15 * 60_000) : null,
        cancelledAt: plan.status === "CANCELLED" ? new Date() : null,
        cancelReason: plan.status === "CANCELLED" ? "Customer had a schedule conflict" : null,
        checkedInAt: plan.status === "COMPLETED" ? startAt : null,
        checkedInById: plan.status === "COMPLETED" ? staff.id : null,
      },
    });

    if (paid) {
      await prisma.payment.create({
        data: {
          purpose: "COURT_BOOKING",
          bookingId: booking.id,
          amount: subtotal,
          status: "PAID",
          provider: "paymongo",
          method: ["gcash", "card", "maya"][index % 3],
          referenceNumber: reference("PAY", 8),
          paidAt: new Date(startAt.getTime() - 3600_000),
        },
      });

      await prisma.sale.create({
        data: {
          reference: reference("SL", 8),
          channel: "COURT_BOOKING",
          customerId: customer.id,
          bookingId: booking.id,
          subtotal,
          discount: 0,
          total: subtotal,
          paymentMethod: ["gcash", "card", "maya"][index % 3],
          status: "PAID",
          soldAt: new Date(startAt.getTime() - 3600_000),
          items: {
            create: {
              description: `${courts[plan.courtIndex].name} · ${plan.durationMins / 60}h`,
              quantity: 1,
              unitPrice: subtotal,
              total: subtotal,
            },
          },
        },
      });
    }
  }

  // A few counter sales so the inventory and sales reports are not empty.
  for (let i = 0; i < 8; i += 1) {
    const product = products[i % products.length];
    const quantity = 1 + (i % 3);
    const subtotal = product.price * quantity;
    const soldAt = new Date(Date.now() - i * 86_400_000 * 0.7);

    await prisma.sale.create({
      data: {
        reference: reference("SL", 8),
        channel: "PRODUCT",
        staffId: staff.id,
        customerId: customers[i % customers.length].id,
        subtotal,
        discount: 0,
        total: subtotal,
        paymentMethod: i % 2 === 0 ? "cash" : "gcash",
        status: "PAID",
        soldAt,
        items: {
          create: {
            productId: product.id,
            description: product.name,
            quantity,
            unitPrice: product.price,
            total: subtotal,
          },
        },
      },
    });

    await prisma.product.update({
      where: { id: product.id },
      data: { stock: { decrement: quantity } },
    });

    const after = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    await prisma.inventoryTransaction.create({
      data: {
        productId: product.id,
        type: "SALE",
        quantity: -quantity,
        balance: after.stock,
        userId: staff.id,
        note: "Counter sale",
      },
    });
  }

  // ---- Open Play ---------------------------------------------------------
  const openPlayPlan = [
    { offset: 1, title: "Friday Night Open Play", startMin: 19 * 60, endMin: 21 * 60, skill: "INTERMEDIATE" as const, max: 16, joiners: 11 },
    { offset: 3, title: "Sunday Morning Social", startMin: 8 * 60, endMin: 10 * 60, skill: "OPEN" as const, max: 16, joiners: 16 },
    { offset: 5, title: "Advanced Ladder Night", startMin: 20 * 60, endMin: 22 * 60, skill: "ADVANCED" as const, max: 12, joiners: 6 },
  ];

  for (const plan of openPlayPlan) {
    const dateISO = dayOffset(plan.offset);
    const session = await prisma.openPlaySession.create({
      data: {
        title: plan.title,
        date: manilaStartOfDay(dateISO),
        startAt: manilaDateTimeToUtc(dateISO, plan.startMin),
        endAt: manilaDateTimeToUtc(dateISO, plan.endMin),
        skillLevel: plan.skill,
        pricePerPlayer: 25000,
        courtCount: 4,
        playersPerCourt: 4,
        minPlayers: 8,
        maxPlayers: plan.max,
        rotationMins: 15,
        status: plan.joiners >= plan.max ? "FULL" : "OPEN",
        notes: "Paddles available to rent at the desk. Arrive 10 minutes early for the first stack.",
      },
    });

    for (let i = 0; i < plan.joiners; i += 1) {
      const customer = customers[i % customers.length];
      const rating = customerSeeds[i % customerSeeds.length][3];

      const player = await prisma.openPlayPlayer.create({
        data: {
          sessionId: session.id,
          userId: customer.id,
          skillRating: rating,
          status: "REGISTERED",
        },
      });

      await prisma.payment.create({
        data: {
          purpose: "OPEN_PLAY",
          openPlayPlayerId: player.id,
          amount: session.pricePerPlayer,
          status: "PAID",
          provider: "paymongo",
          method: "gcash",
          referenceNumber: reference("PAY", 8),
          paidAt: new Date(),
        },
      });
    }

    // The full session also gets a short waitlist to exercise that flow.
    if (plan.joiners >= plan.max) {
      for (let i = 0; i < 3; i += 1) {
        await prisma.waitlist.create({
          data: {
            sessionId: session.id,
            userId: customers[(plan.joiners + i) % customers.length].id,
            position: i + 1,
            status: "WAITING",
          },
        });
      }
    }
  }

  console.log(`
Seed complete.

  Courts:      ${courts.length}
  Customers:   ${customers.length}
  Bookings:    ${bookingPlan.length}
  Products:    ${products.length}
  Open Play:   ${openPlayPlan.length} sessions

Sign in with password "${SEED_PASSWORD}":

  Super admin  ${superAdmin.email}
  Admin        ${admin.email}
  Staff        ${staff.email}
  Customer     ${customers[0].email}
`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
