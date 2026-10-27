import { z } from "zod";

const dateISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date");
const cuid = z.string().min(1);
const centavos = z.number().int().min(0).max(100_000_000);

export const registerSchema = z
  .object({
    fullName: z.string().trim().min(2, "Please enter your full name").max(80),
    email: z.string().trim().toLowerCase().email("Enter a valid email address"),
    mobile: z
      .string()
      .trim()
      .regex(/^(\+63|0)9\d{9}$/, "Enter a valid PH mobile number, e.g. 09171234567"),
    password: z
      .string()
      .min(10, "Use at least 10 characters")
      .max(200)
      .regex(/[a-z]/, "Include a lowercase letter")
      .regex(/[A-Z]/, "Include an uppercase letter")
      .regex(/\d/, "Include a number"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(10).regex(/[A-Z]/).regex(/[a-z]/).regex(/\d/),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const profileSchema = z.object({
  fullName: z.string().trim().min(2).max(80),
  mobile: z.string().trim().regex(/^(\+63|0)9\d{9}$/),
  emergencyContact: z.string().trim().max(160).optional().nullable(),
  avatarUrl: z.string().url().optional().nullable(),
});

export const quoteSchema = z.object({
  courtId: cuid,
  date: dateISO,
  startMin: z.number().int().min(0).max(1439),
  durationMins: z.number().int().min(15).max(480),
  promoCode: z.string().trim().max(32).optional().nullable(),
});

export const createBookingSchema = quoteSchema.extend({
  notes: z.string().trim().max(400).optional().nullable(),
});

export const adminBookingSchema = createBookingSchema.extend({
  customerId: cuid.optional(),
  customerEmail: z.string().email().optional(),
  customerName: z.string().trim().min(2).optional(),
  customerMobile: z.string().trim().optional(),
  markPaid: z.boolean().default(false),
  paymentMethod: z.string().default("cash"),
});

export const rescheduleSchema = z.object({
  courtId: cuid,
  date: dateISO,
  startMin: z.number().int().min(0).max(1439),
  durationMins: z.number().int().min(15).max(480),
});

export const courtSchema = z.object({
  name: z.string().trim().min(1).max(60),
  number: z.number().int().min(1).max(999),
  description: z.string().trim().max(600).optional().nullable(),
  indoor: z.boolean().default(true),
  surface: z.enum(["ACRYLIC", "CONCRETE", "CUSHIONED", "WOOD", "SYNTHETIC"]).default("ACRYLIC"),
  status: z.enum(["AVAILABLE", "MAINTENANCE", "CLOSED"]).default("AVAILABLE"),
  hourlyPrice: centavos,
  amenities: z.array(z.string().trim().max(40)).max(20).default([]),
  active: z.boolean().default(true),
  bookable: z.boolean().default(true),
});

export const courtBlockSchema = z.object({
  courtId: cuid,
  date: dateISO,
  startMin: z.number().int().min(0).max(1439),
  endMin: z.number().int().min(1).max(1440),
  reason: z.enum(["MAINTENANCE", "PRIVATE_EVENT", "OPEN_PLAY", "CLOSED", "OTHER"]),
  note: z.string().trim().max(200).optional().nullable(),
});

export const openPlaySessionSchema = z.object({
  title: z.string().trim().min(2).max(80),
  date: dateISO,
  startMin: z.number().int().min(0).max(1439),
  endMin: z.number().int().min(1).max(1440),
  skillLevel: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED", "OPEN"]),
  pricePerPlayer: centavos,
  courtCount: z.number().int().min(1).max(20),
  playersPerCourt: z.number().int().min(2).max(8).default(4),
  minPlayers: z.number().int().min(1).max(200),
  maxPlayers: z.number().int().min(1).max(200),
  rotationMins: z.number().int().min(5).max(120).default(15),
  status: z.enum(["DRAFT", "OPEN", "FULL", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).default("OPEN"),
  notes: z.string().trim().max(500).optional().nullable(),
});

export const joinOpenPlaySchema = z.object({
  skillRating: z.number().min(1).max(8).optional(),
  preferredSide: z.enum(["LEFT", "RIGHT", "ANY"]).optional(),
});

export const productSchema = z.object({
  name: z.string().trim().min(1).max(80),
  sku: z.string().trim().min(1).max(40).toUpperCase(),
  category: z.string().trim().min(1).max(40),
  description: z.string().trim().max(500).optional().nullable(),
  cost: centavos,
  price: centavos,
  minStock: z.number().int().min(0).max(100000).default(0),
  supplier: z.string().trim().max(80).optional().nullable(),
  imageUrl: z.string().url().optional().nullable(),
  rentable: z.boolean().default(false),
  active: z.boolean().default(true),
});

export const stockMovementSchema = z.object({
  type: z.enum(["PURCHASE", "SALE", "DAMAGED", "ADJUSTMENT", "RETURN", "RENTAL_OUT", "RENTAL_IN"]),
  quantity: z.number().int().refine((n) => n !== 0, "Quantity cannot be zero"),
  unitCost: centavos.optional(),
  note: z.string().trim().max(200).optional().nullable(),
});

export const saleSchema = z.object({
  customerId: cuid.optional().nullable(),
  channel: z.enum(["PRODUCT", "RENTAL", "OTHER"]).default("PRODUCT"),
  paymentMethod: z.string().trim().min(1).max(30).default("cash"),
  discount: centavos.default(0),
  items: z
    .array(
      z.object({
        productId: cuid.optional().nullable(),
        description: z.string().trim().min(1).max(120),
        quantity: z.number().int().min(1).max(999),
        unitPrice: centavos,
      }),
    )
    .min(1, "Add at least one item"),
});

export const userSchema = z.object({
  fullName: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  mobile: z.string().trim().max(20).optional().nullable(),
  role: z.enum(["SUPER_ADMIN", "ADMIN", "STAFF", "CUSTOMER"]),
  password: z.string().min(10).optional(),
  status: z.enum(["ACTIVE", "DISABLED"]).default("ACTIVE"),
});

export const promoSchema = z.object({
  code: z.string().trim().toUpperCase().min(3).max(24),
  description: z.string().trim().max(200).optional().nullable(),
  discountType: z.enum(["PERCENT", "FIXED"]),
  value: z.number().int().min(1),
  startsAt: z.string().datetime().optional().nullable(),
  endsAt: z.string().datetime().optional().nullable(),
  usageLimit: z.number().int().min(1).optional().nullable(),
  perUserLimit: z.number().int().min(1).optional().nullable(),
  minPurchase: centavos.default(0),
  courtIds: z.array(cuid).default([]),
  active: z.boolean().default(true),
});

export const facilityImageSchema = z.object({
  url: z.string().url(),
  title: z.string().trim().max(80).optional().nullable(),
  caption: z.string().trim().max(200).optional().nullable(),
  sortOrder: z.number().int().min(0).max(999).default(0),
  featured: z.boolean().default(false),
  active: z.boolean().default(true),
  courtId: cuid.optional().nullable(),
});

export const pricingRuleSchema = z.object({
  name: z.string().trim().min(2).max(60),
  scope: z.enum(["COURT_HOURLY", "OPEN_PLAY", "RENTAL"]).default("COURT_HOURLY"),
  courtId: cuid.optional().nullable(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  startMin: z.number().int().min(0).max(1440),
  endMin: z.number().int().min(0).max(1440),
  pricePerHour: centavos,
  priority: z.number().int().min(0).max(1000).default(0),
  active: z.boolean().default(true),
});

export const settingsSchema = z.object({
  businessName: z.string().trim().min(1).max(60).optional(),
  logoUrl: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().trim().max(30).optional(),
  address: z.string().trim().max(200).optional(),
  openingMin: z.number().int().min(0).max(1439).optional(),
  closingMin: z.number().int().min(1).max(1440).optional(),
  bookingIntervalMins: z.number().int().min(15).max(120).optional(),
  minBookingMins: z.number().int().min(15).max(480).optional(),
  maxBookingMins: z.number().int().min(30).max(720).optional(),
  maxAdvanceDays: z.number().int().min(1).max(365).optional(),
  minCancelNoticeMins: z.number().int().min(0).max(10080).optional(),
  holdMinutes: z.number().int().min(3).max(120).optional(),
  bufferMins: z.number().int().min(0).max(60).optional(),
  openPlayHoldMinutes: z.number().int().min(3).max(120).optional(),
  waitlistOfferMinutes: z.number().int().min(5).max(1440).optional(),
  cancellationPolicy: z.string().trim().max(1000).optional(),
});

export const checkinSchema = z.object({ token: z.string().min(5).max(200) });
