-- EzPickle hard database guarantees.
-- Run after every `prisma migrate deploy` (npm run db:constraints).
-- These are the *real* protection against double booking; the application
-- transaction is only the friendly first line of defence.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 1. A court can never hold two live bookings that overlap in time.
--    Live = anything that occupies the court. Cancelled / expired / no-show
--    bookings drop out of the index automatically.
ALTER TABLE "Booking" DROP CONSTRAINT IF EXISTS booking_no_overlap;
ALTER TABLE "Booking"
  ADD CONSTRAINT booking_no_overlap
  EXCLUDE USING gist (
    "courtId" WITH =,
    tstzrange("startAt", "endAt", '[)') WITH &&
  )
  WHERE (status IN ('PENDING', 'PAYMENT_PENDING', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED'));

-- 2. A court block can never overlap another block on the same court.
ALTER TABLE "CourtBlock" DROP CONSTRAINT IF EXISTS court_block_no_overlap;
ALTER TABLE "CourtBlock"
  ADD CONSTRAINT court_block_no_overlap
  EXCLUDE USING gist (
    "courtId" WITH =,
    tstzrange("startAt", "endAt", '[)') WITH &&
  );

-- 3. Sanity: end must be after start.
ALTER TABLE "Booking" DROP CONSTRAINT IF EXISTS booking_time_order;
ALTER TABLE "Booking" ADD CONSTRAINT booking_time_order CHECK ("endAt" > "startAt");

ALTER TABLE "CourtBlock" DROP CONSTRAINT IF EXISTS court_block_time_order;
ALTER TABLE "CourtBlock" ADD CONSTRAINT court_block_time_order CHECK ("endAt" > "startAt");

-- 4. Money is never negative.
ALTER TABLE "Booking" DROP CONSTRAINT IF EXISTS booking_total_non_negative;
ALTER TABLE "Booking" ADD CONSTRAINT booking_total_non_negative CHECK ("total" >= 0 AND "discount" >= 0);

ALTER TABLE "Payment" DROP CONSTRAINT IF EXISTS payment_amount_positive;
ALTER TABLE "Payment" ADD CONSTRAINT payment_amount_positive CHECK ("amount" >= 0);

-- 5. Stock can never go below zero through any code path.
ALTER TABLE "Product" DROP CONSTRAINT IF EXISTS product_stock_non_negative;
ALTER TABLE "Product" ADD CONSTRAINT product_stock_non_negative CHECK ("stock" >= 0);

-- 6. Open Play sessions cannot oversubscribe below the configured floor.
ALTER TABLE "OpenPlaySession" DROP CONSTRAINT IF EXISTS openplay_capacity_sane;
ALTER TABLE "OpenPlaySession"
  ADD CONSTRAINT openplay_capacity_sane CHECK ("maxPlayers" >= "minPlayers" AND "maxPlayers" > 0);

-- 7. Helpful partial index for the hold-release sweeper.
CREATE INDEX IF NOT EXISTS booking_active_holds_idx
  ON "Booking" ("holdExpiresAt")
  WHERE status = 'PAYMENT_PENDING';
