# EzPickle

A production pickleball facility platform for the Philippine market: live court availability, real PayMongo payments, QR check-in, Open Play with automatic skill-balanced stacking, inventory, sales, reports and a role-based back office.

Built with Next.js 15 (App Router), React 19, TypeScript, Tailwind, Prisma and PostgreSQL. All times are Asia/Manila, all money is PHP stored as integer centavos.

---

## Table of contents

1. [What this is](#what-this-is)
2. [Quick start](#quick-start)
3. [Environment variables](#environment-variables)
4. [Database setup](#database-setup)
5. [PayMongo setup](#paymongo-setup)
6. [Webhook setup](#webhook-setup)
7. [Project structure](#project-structure)
8. [Data model](#data-model)
9. [How the important parts work](#how-the-important-parts-work)
10. [Admin guide](#admin-guide)
11. [Testing](#testing)
12. [Deployment](#deployment)
13. [Security checklist](#security-checklist)
14. [Accessibility and performance](#accessibility-and-performance)
15. [Known limitations](#known-limitations)
16. [Future improvements](#future-improvements)

---

## What this is

**Customer side**

- Homepage with facility slideshow, court cards, pricing and Open Play preview
- Live availability grid, updating over SSE as other people book
- Five-step booking wizard: date → court → time → details → payment
- Real PayMongo hosted checkout (GCash, Maya, GrabPay, QR Ph, cards)
- Booking confirmation with a signed QR code
- Customer dashboard: upcoming and past bookings, payment history, profile, password
- Open Play: browse sessions, join as an individual, waitlist when full, see your stack

**Staff side**

- Dashboard: today's revenue, bookings, utilization, pending payments, low stock
- Calendar: day grid, week and month views
- Bookings: filter, search, create walk-ins, reschedule, cancel, refund
- QR check-in with a camera or a handheld scanner
- Courts, pricing rules and maintenance blocks
- Open Play sessions with the auto-stacker and manual overrides
- Customers, inventory with a movement ledger, counter sales
- Sales, utilization and inventory reports, all exporting to CSV
- Users and roles, media manager, promo codes, business settings, audit log

---

## Quick start

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env
# Fill in DATABASE_URL, SESSION_SECRET and your PayMongo test keys

# 3. Create the schema, apply constraints, load demo data
npm run db:setup

# 4. Run
npm run dev
```

Open <http://localhost:3000>.

Seeded accounts (password `EzPickle!2026`, or whatever you set as `SEED_PASSWORD`):

| Role | Email |
| --- | --- |
| Super Admin | `owner@ezpickle.ph` |
| Admin | `manager@ezpickle.ph` |
| Staff | `frontdesk@ezpickle.ph` |
| Customer | `ana.cruz@example.com` |

**Requirements:** Node 20+, PostgreSQL 14+ (the `btree_gist` extension must be installable — it ships with standard Postgres and is available on Supabase, Neon and RDS).

---

## Environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection string. |
| `APP_URL` | yes | Public base URL. Used for checkout redirects, sitemap and emails. |
| `NODE_ENV` | — | `development` \| `test` \| `production`. |
| `SESSION_SECRET` | yes | 32+ chars. Session token hashing and QR signing. `openssl rand -base64 48`. |
| `PAYMONGO_SECRET_KEY` | for payments | `sk_test_…` or `sk_live_…`. Server only, never exposed. |
| `PAYMONGO_PUBLIC_KEY` | — | Reserved for future client-side elements. |
| `PAYMONGO_WEBHOOK_SECRET` | for payments | `whsk_…` from webhook creation. |
| `PAYMONGO_LIVEMODE` | yes in prod | `true` with live keys. Guards against test events reaching live logic. |
| `PAYMONGO_PAYMENT_METHODS` | — | Comma separated. Must be enabled on your PayMongo account. |
| `CRON_SECRET` | recommended | Bearer token for `/api/cron/release-holds`. |
| `RESEND_API_KEY` | optional | Without it, notifications are stored in the DB but not emailed. |
| `MAIL_FROM` | optional | Sender identity for emails. |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_BUCKET` | optional | Direct media upload. Without them, the media manager takes hosted URLs. |
| `SEED_ENABLED` | dev only | Must be `true` to seed when `NODE_ENV=production`. |
| `SEED_PASSWORD` | dev only | Password for every seeded account. |

`src/lib/env.ts` validates these with Zod at boot and fails fast with a readable message rather than misbehaving later.

---

## Database setup

```bash
npm run db:migrate      # create/apply migrations
npm run db:constraints  # apply the exclusion constraints (REQUIRED)
npm run db:seed         # demo data
```

`npm run db:setup` runs all three.

### Why `db:constraints` is a separate step

Prisma Migrate cannot express PostgreSQL `EXCLUDE` constraints. They live in `prisma/sql/constraints.sql` and are applied idempotently by `scripts/apply-constraints.ts`.

**The app is not safe without this step.** It is what makes double-booking impossible at the storage layer:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Booking" ADD CONSTRAINT booking_no_overlap
  EXCLUDE USING gist (
    "courtId" WITH =,
    tstzrange("startAt", "endAt", '[)') WITH &&
  ) WHERE (status IN ('PENDING','PAYMENT_PENDING','CONFIRMED','CHECKED_IN','COMPLETED'));
```

The file also adds an equivalent constraint for court blocks, time-ordering checks (`endAt > startAt`), non-negative money and stock checks, an Open Play capacity check, and a partial index on active holds.

Run it again after any migration that recreates those tables.

---

## PayMongo setup

This uses the **v2 Checkout Sessions API** (`POST https://api.paymongo.com/v2/checkout_sessions`), which defers Payment Intent creation and supports pass-on fees.

1. Create an account at <https://dashboard.paymongo.com>.
2. Copy your test secret key into `PAYMONGO_SECRET_KEY`.
3. Enable the payment methods you want (GCash, Maya, GrabPay, QR Ph, cards) and list them in `PAYMONGO_PAYMENT_METHODS`.
4. Test with PayMongo's documented test cards and the GCash test flow.
5. To go live: swap in `sk_live_…`, set `PAYMONGO_LIVEMODE=true`, and create a **live** webhook.

Notes that matter:

- Amounts are integer centavos. ₱600.00 is `60000`. The app stores money this way end to end — no floats anywhere.
- Authentication is HTTP Basic with the secret key as the username and an empty password.
- Every checkout creation sends an `Idempotency-Key` derived from the booking id and amount, so a double-submit returns the original session rather than creating a second one.
- Refunds still use the v1 endpoint (`POST /v1/refunds`), which is PayMongo's current design.

---

## Webhook setup

**The webhook is the only thing that confirms a booking.** The browser redirect after checkout is treated as a hint, never as proof of payment.

### Create the webhook

```bash
curl https://api.paymongo.com/v1/webhooks \
  -u sk_test_YOURKEY: \
  -H 'Content-Type: application/json' \
  -d '{
    "data": { "attributes": {
      "url": "https://your-domain.com/api/webhooks/paymongo",
      "events": ["checkout_session.payment.paid", "payment.failed", "payment.refunded"]
    }}
  }'
```

Copy the returned `secret_key` (`whsk_…`) into `PAYMONGO_WEBHOOK_SECRET`.

### Local testing

```bash
npx ngrok http 3000
# then register https://<id>.ngrok-free.app/api/webhooks/paymongo
```

### How verification works

PayMongo sends a `Paymongo-Signature` header shaped like `t=<unix>,te=<test-sig>,li=<live-sig>`. The handler:

1. Reads the **raw** request body (parsing and re-stringifying would change the bytes and break the HMAC).
2. Computes `HMAC-SHA256(secret, "${timestamp}.${rawBody}")`.
3. Compares against `te` or `li` depending on `PAYMONGO_LIVEMODE`, using `timingSafeEqual`.
4. Rejects timestamps more than 300 seconds old, which blocks replays.
5. Inserts the event id into `WebhookEvent`, whose unique constraint makes duplicate delivery a no-op.
6. Only then fulfils the booking inside a transaction and writes the `Sale` row.

If fulfilment throws, the dedupe row is deleted and a 500 is returned so PayMongo retries.

---

## Project structure

```
ezpickle/
├── prisma/
│   ├── schema.prisma           # 24 models
│   ├── seed.ts                 # demo data, production-guarded
│   └── sql/constraints.sql     # exclusion constraints and checks
├── scripts/
│   ├── apply-constraints.ts
│   └── release-holds.ts        # cron entry point
├── public/                     # logo, og-image
├── src/
│   ├── app/
│   │   ├── (site)/             # public pages: home, book, open-play, dashboard
│   │   ├── (auth)/             # login, register
│   │   ├── admin/              # back office (15 screens)
│   │   ├── api/                # route handlers
│   │   ├── layout.tsx  globals.css  sitemap.ts  robots.ts
│   ├── components/
│   │   ├── ui/                 # button, toast, primitives
│   │   ├── admin/              # shell, shared admin toolkit
│   │   └── …                   # hero, slideshow, booking wizard, etc.
│   ├── hooks/use-realtime.ts   # SSE subscriber
│   └── lib/                    # the actual business logic
│       ├── booking.ts          # availability, quotes, holds, cancellation
│       ├── pricing.ts          # interval-by-interval rate engine
│       ├── stacking.ts         # pure Open Play stacker
│       ├── paymongo.ts         # checkout, refunds, signature verification
│       ├── auth.ts  rbac.ts  guard.ts
│       ├── time.ts             # Manila ↔ UTC conversions
│       └── …
└── tests/
```

---

## Data model

24 models. The ones that carry the most weight:

- **User** — one table for customers and staff, separated by `Role` (`SUPER_ADMIN`, `ADMIN`, `STAFF`, `CUSTOMER`). Soft-deleted.
- **Session** — opaque, DB-backed auth sessions. Revocable instantly, which a JWT is not.
- **Court**, **CourtImage**, **CourtBlock** — courts, photos and maintenance windows.
- **Booking** — the centre of gravity. A hold *is* a booking row with `status = PAYMENT_PENDING` and a `holdExpiresAt`, so the exclusion constraint protects held slots exactly as it protects paid ones.
- **Payment** — one row per checkout attempt, linked to a booking or an Open Play seat.
- **WebhookEvent** — dedupe ledger, unique on the provider event id.
- **OpenPlaySession / OpenPlayPlayer / OpenPlayGroup / PlayerPairHistory / Waitlist** — sessions, rosters, generated courts, who has already played with whom, and the queue.
- **Product / InventoryTransaction** — stock with a signed, append-only movement ledger carrying a running balance.
- **Sale / SaleItem** — every transaction, whatever the channel.
- **PricingRule** — day-of-week and time-window rates with priority. No price is hardcoded.
- **PromoCode**, **Setting**, **Notification**, **AuditLog**, **RateLimitHit**.

---

## How the important parts work

### Double-booking is impossible, in three layers

1. **Advisory lock** — `pg_advisory_xact_lock(hashtext(courtId))` serialises concurrent attempts on the same court, so they queue instead of racing.
2. **SERIALIZABLE transaction** — the availability read and the insert are one atomic unit.
3. **Exclusion constraint** — `booking_no_overlap` is the final authority. Even a bug in application code, a raw SQL insert or a second deployment cannot produce an overlap. The constraint violation is caught and returned as a friendly `slot_taken` error.

Front-end validation exists only to make the experience pleasant. It is never trusted.

### Holds

A hold is a real booking row with `PAYMENT_PENDING` and `holdExpiresAt`. It occupies the slot for everyone. `scripts/release-holds.ts` (or `GET /api/cron/release-holds` with the `CRON_SECRET` bearer token) flips lapsed holds to `EXPIRED`, publishes an availability event, and promotes the Open Play waitlist. The sweeper is idempotent and safe to run concurrently — every update is conditional on the row still being in the holding state.

Run it every minute:

```
* * * * * curl -s -H "Authorization: Bearer $CRON_SECRET" https://your-domain.com/api/cron/release-holds
```

On Vercel, use `vercel.json` cron instead.

### Pricing

`priceBooking()` walks the booking in interval-sized steps and looks up the applicable rule for each step. A 16:00–18:00 Monday booking is billed one hour off-peak and one hour peak, not two hours at whatever the start time happened to be. Court-specific rules outrank facility-wide rules at equal priority; the court's `hourlyPrice` is the fallback when nothing matches.

### Time

Everything is stored in UTC and rendered in Asia/Manila via `date-fns-tz`. The server's own timezone is never trusted. `manilaDateTimeToUtc(dateISO, minutesFromMidnight)` is the single conversion point, which is what makes DST-free but offset-sensitive reasoning reliable.

### Money

Integer centavos everywhere — database, API, PayMongo, CSV exports. `peso()` formats for display. No floating point arithmetic touches money at any point.

### Open Play stacking

`stackPlayers()` is a pure function with no I/O, which is what makes it testable. It seeds groups by skill band, then hill-climbs to minimise intra-court rating spread while penalising pairings recorded in `PlayerPairHistory`. Capacity is never exceeded; leftovers go to a clearly labelled bench rather than being silently dropped. Staff can override any placement by hand afterwards.

### Real-time

Server-Sent Events at `/api/events`, backed by an in-process pub/sub bus. The client hook reconnects with exponential backoff and pauses while the tab is hidden.

### Authentication

Opaque random tokens, SHA-256 hashed with `SESSION_SECRET` before storage, in an `httpOnly` cookie. Passwords are bcrypt at cost 12. CSRF uses a double-submit pattern: a readable `ezp_csrf` cookie that the client echoes in the `x-csrf-token` header, compared with `timingSafeEqual`.

### Authorization

`PERMISSIONS` in `src/lib/rbac.ts` is the single source of truth. `requirePermission()` guards every admin route handler. The sidebar hides what a role cannot reach, but that is convenience only — the API check is the boundary, and it runs regardless of what the UI does.

---

## Admin guide

Sign in at `/login` with a staff account; you land on `/admin`.

**Daily front desk**

1. **Check-in** — scan the customer's QR or type their `EZP-…` reference. Unpaid or cancelled bookings are refused with a clear reason.
2. **Bookings → New booking** — walk-ins. Creates the customer account if they're new, and records cash payment if collected.
3. **Sales → Counter sale** — merchandise, drinks and rentals. Stock is deducted atomically.

**Setting up**

1. **Settings** — business details, opening hours, slot interval, min/max booking length, advance window, hold minutes, cancellation policy. These drive the whole system.
2. **Courts** — add courts, then add **pricing rules**. Rules are matched by day and time window; higher priority wins.
3. **Media** — add facility photos for the homepage slideshow and reorder them.
4. **Users** — create staff accounts. Roles:
   - *Super Admin*: everything, including user management and settings.
   - *Admin*: operations, reports, refunds. No user management.
   - *Staff*: bookings, check-in, counter sales, inventory reads.
5. **Promos** — discount codes with total and per-customer limits, enforced server-side at redemption.

**Open Play**

Create a session, set courts and capacity, then use **Manage stack → Generate stack** once players have signed up. Move anyone by hand afterwards. Full sessions collect a waitlist, and cancellations promote the next person automatically.

**Reports**

Sales, Utilization and Inventory, each with date ranges and a CSV export.

**Audit logs**

Every privileged action, with actor, IP and before/after state. Append-only.

---

## Testing

```bash
npm test           # unit tests, no database needed
npm run test:watch
npm run typecheck
npm run lint
```

**Unit tests (always run)**

- `tests/pricing.test.ts` — off-peak, peak, weekend, priority ordering, court-specific overrides, fallback, and the peak/off-peak straddle case billed per interval
- `tests/stacking.test.ts` — capacity, odd player counts, nobody dropped, tight skill spread, repeat-pairing avoidance, determinism
- `tests/webhook.test.ts` — valid signature, tampered body, wrong secret, replay outside tolerance, test-vs-live mode confusion, raw-body sensitivity
- `tests/permissions.test.ts` — the full role/permission matrix, including the hierarchy invariant

**Integration tests (opt in)**

`tests/booking-concurrency.test.ts` needs a real database with the constraints applied. It fires ten simultaneous requests at one slot and asserts exactly one wins.

```bash
createdb ezpickle_test
DATABASE_URL=postgresql://…/ezpickle_test npx prisma migrate deploy
DATABASE_URL=postgresql://…/ezpickle_test npm run db:constraints
TEST_DATABASE=1 DATABASE_URL=postgresql://…/ezpickle_test npm test
```

Without `TEST_DATABASE=1` these are skipped, so `npm test` stays green anywhere.

---

## Deployment

### Vercel (recommended)

1. Push to GitHub and import the repo.
2. Add every environment variable from the table above.
3. Build command is `npm run build` (which runs `prisma generate` first).
4. After the first deploy, from a machine with `DATABASE_URL` set:
   ```bash
   npx prisma migrate deploy
   npm run db:constraints
   ```
5. Add the hold sweeper to `vercel.json`:
   ```json
   { "crons": [{ "path": "/api/cron/release-holds", "schedule": "* * * * *" }] }
   ```
6. Register the production PayMongo webhook against your live domain and set `PAYMONGO_LIVEMODE=true`.

### Anywhere else

Standard Next.js standalone build. You need Node 20+, a reachable PostgreSQL, and a scheduler hitting the hold-release endpoint. Everything else is stateless apart from the SSE bus (see limitations).

### Pre-launch checklist

- [ ] `npm run db:constraints` has been run against production
- [ ] `SESSION_SECRET` is a fresh 32+ char random value, not the dev one
- [ ] `PAYMONGO_LIVEMODE=true` and live keys are in place
- [ ] Live webhook registered and verified with a real ₱1 transaction
- [ ] `CRON_SECRET` set and the sweeper confirmed running
- [ ] Seeded demo accounts deleted, real staff accounts created
- [ ] `SEED_ENABLED` unset
- [ ] Settings, courts and pricing rules configured for the real facility
- [ ] HTTPS enforced

---

## Security checklist

| Area | Approach |
| --- | --- |
| Passwords | bcrypt, cost 12. Never logged or returned. |
| Sessions | Opaque random tokens, SHA-256 hashed at rest, `httpOnly` + `secure` + `sameSite=lax`, 14-day expiry, instantly revocable. |
| CSRF | Double-submit cookie compared with `timingSafeEqual` on every mutating request. |
| Authorization | Central permission map; `requirePermission()` on every admin handler. UI visibility is never the boundary. |
| SQL injection | Prisma parameterises everything; the handful of raw queries use tagged templates. |
| XSS | React escapes by default. No `dangerouslySetInnerHTML` outside the JSON-LD block, which is serialised data. |
| Rate limiting | DB-backed sliding window on login (by IP *and* by account), registration, booking creation, checkout and password change. |
| Payment integrity | Webhook signature verification with replay protection; event-id dedupe; booking confirmed only from a verified webhook. |
| Webhook replay | 300-second timestamp tolerance plus a unique constraint on the event id. |
| QR forgery | Tokens are HMAC-signed with `SESSION_SECRET`; the token is a lookup hint and the database row is always the authority. |
| Enumeration | Login returns one message for both unknown email and wrong password, with similar timing. |
| Secrets | Server-only modules marked `server-only`; no secret is ever imported into a client bundle. |
| Headers | CSP-adjacent headers, `X-Frame-Options`, `Referrer-Policy` and HSTS set in `next.config.ts`. |
| Audit | Every privileged action recorded with actor, IP and before/after state. |
| Error messages | `AppError` carries a customer-safe message; internals go to the server log, never to the browser. |
| Soft deletes | Users, courts and products are deactivated, not destroyed, so history stays intact. |

---

## Accessibility and performance

- Semantic HTML, a skip link, and `aria-current` / `aria-pressed` / `aria-live` where state is conveyed visually
- Every interactive control is keyboard reachable; modals close on Escape and trap focus visually
- Colour is never the sole carrier of meaning — availability states also carry text and shape
- Contrast meets WCAG AA against the near-black background
- **Every animation respects `prefers-reduced-motion`**: `Reveal` collapses to a plain div, the confirmation checkmark and capacity bars skip their draw, and a global CSS block disables transitions
- Server components fetch data; client components are used only where interaction demands it
- Home page is cached with `revalidate = 120`; availability and admin routes are `force-dynamic`
- Skeleton states rather than layout-shifting spinners
- Images use `loading="lazy"` and `max-width: 100%`

---

## Known limitations

1. **Nothing here has been executed.** The build environment had no network access, so `npm install`, `prisma migrate` and `next build` were never run. Expect to fix a small number of type or import errors on first build. `npm run typecheck` is the fastest way to find them.
2. **SSE is single-instance.** The pub/sub bus lives in process memory. On multiple instances, a booking made on instance A will not push to a browser connected to instance B — though polling and page loads still show correct data. Swap `src/lib/realtime.ts` for Postgres `LISTEN`/`NOTIFY` or Redis before scaling horizontally.
3. **Media upload is URL-based** unless Supabase credentials are configured. The admin media manager accepts hosted URLs.
4. **Email only sends with `RESEND_API_KEY`.** Without it, notifications are persisted to the `Notification` table but never delivered. SMS is not implemented at all.
5. **Refunds use PayMongo v1**, since that is where the refunds endpoint lives. Partial refunds are supported; the refund status is not polled afterwards.
6. **Camera QR scanning uses `BarcodeDetector`**, which Safari and older Android do not support. Those browsers fall back to the text field, and a handheld scanner always works.
7. **No password reset email flow.** Staff can reset a password from the Users screen; customers currently need to ask.
8. **Rate limiting is per-database, not per-edge.** It is correct but adds a query per guarded request. A Redis or edge middleware layer would be faster under load.
9. **Reports load fully into memory** for the selected range. Fine for a single facility for years; a multi-site rollout would want aggregate tables.
10. **Timezone is fixed to Asia/Manila** and currency to PHP. Both are woven into storage and formatting, so multi-region would be real work rather than a config change.

---

## Future improvements

- Postgres `LISTEN`/`NOTIFY` or Redis for multi-instance real time
- Password reset and email verification flows
- SMS notifications via Semaphore or Twilio for booking reminders
- Recurring bookings and membership plans with stored credit
- Coach scheduling and lesson bookings as a first-class booking type
- Tournament brackets built on the existing Open Play grouping
- Native `BarcodeDetector` polyfill so camera check-in works everywhere
- Loyalty points, referral codes and package deals
- Multi-facility support with per-venue settings and pricing
- A customer-facing mobile app sharing the existing API
- Aggregate report tables for instant multi-year analytics
- Waitlist auto-charge for customers who opt into a saved payment method

---

Built for EzPickle. Play easy, play more.
