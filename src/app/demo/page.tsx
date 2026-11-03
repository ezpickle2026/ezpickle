import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CalendarCheck,
  Check,
  Clock,
  CreditCard,
  Mail,
  Package,
  QrCode,
  ShieldCheck,
  Shuffle,
  Smartphone,
  Users,
  Zap,
} from "lucide-react";
import { Logo } from "@/components/logo";

/**
 * Sales landing page for facility owners evaluating EzPickle.
 * Fully static: no database reads, so it renders even on a fresh install.
 *
 * Change CONTACT_EMAIL to the inbox that should receive demo requests.
 */
const CONTACT_EMAIL = "hello@ezpickle.ph";
const DEMO_MAILTO = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
  "EzPickle demo request",
)}&body=${encodeURIComponent(
  "Hi EzPickle team,\n\nI'd like a walkthrough for my facility.\n\nFacility name:\nCity:\nNumber of courts:\nBest time to call:\n",
)}`;

export const metadata: Metadata = {
  title: "EzPickle for Facilities — Run your courts on autopilot",
  description:
    "Online court booking, PayMongo payments, QR check-in, Open Play stacking, inventory and reports — one platform built for Philippine pickleball facilities.",
  alternates: { canonical: "/demo" },
};

const NAV = [
  ["Features", "#features"],
  ["Open Play", "#open-play"],
  ["How it works", "#how"],
  ["FAQ", "#faq"],
] as const;

const PAYMENT_METHODS = ["GCash", "Maya", "GrabPay", "QR Ph", "Visa / Mastercard"];

const FEATURES = [
  {
    icon: CalendarCheck,
    title: "Live online booking",
    body: "Players see real-time court availability and book in about a minute. The grid updates instantly when someone else reserves a slot.",
  },
  {
    icon: CreditCard,
    title: "Paid before they play",
    body: "PayMongo hosted checkout with GCash, Maya, GrabPay, QR Ph and cards. Unpaid holds release automatically — no more ghost reservations.",
  },
  {
    icon: QrCode,
    title: "QR check-in",
    body: "Every booking gets a signed QR code. Front desk scans with a phone camera or a handheld scanner and the court is marked checked-in.",
  },
  {
    icon: Shuffle,
    title: "Open Play, sorted",
    body: "Players join sessions online, overflow goes to a waitlist, and the auto-stacker builds skill-balanced games. Staff can override any time.",
  },
  {
    icon: Package,
    title: "Inventory & counter sales",
    body: "Sell paddles, balls and drinks at the counter. Every stock movement is logged so you always know what's on the shelf.",
  },
  {
    icon: BarChart3,
    title: "Reports that export",
    body: "Revenue, utilization and inventory reports by day, week or month — all downloadable as CSV for your accountant.",
  },
];

const OWNER_WINS = [
  "No more booking over Messenger, Viber or spreadsheets",
  "Double-booking is impossible — enforced by the database itself",
  "Walk-ins, reschedules, cancellations and refunds from one screen",
  "Peak / off-peak pricing rules and promo codes",
  "Role-based access for owners, managers and front desk",
  "Full audit log of every change your staff makes",
];

const STEPS = [
  {
    n: "01",
    title: "Tell us about your facility",
    body: "Courts, operating hours, rates and your logo. We set up your branded booking site.",
  },
  {
    n: "02",
    title: "Connect PayMongo",
    body: "Link your PayMongo account so payments land directly with you. We help with the setup.",
  },
  {
    n: "03",
    title: "Share your link and go live",
    body: "Post your booking link on Facebook and Instagram. Players book and pay — you just open the doors.",
  },
];

const FAQ = [
  {
    q: "Do players need to download an app?",
    a: "No. EzPickle runs in any mobile browser. Players open your link, pick a court and pay — no install and no account needed to browse.",
  },
  {
    q: "Where does the money go?",
    a: "Straight to your own PayMongo account. EzPickle never holds your funds.",
  },
  {
    q: "Can it use my facility's name and logo?",
    a: "Yes. Your business name, logo, photos, hero text and pricing are all editable from the admin settings.",
  },
  {
    q: "What happens if two people try to book the same slot?",
    a: "Only one wins. Court overlaps are blocked at the database level, so a double-booking cannot be saved — even if two payments arrive at the same second.",
  },
  {
    q: "We still get a lot of walk-ins. Does that work?",
    a: "Yes. Front desk can create walk-in bookings and record cash, GCash or card payments at the counter. They show up on the same live calendar.",
  },
  {
    q: "How long does setup take?",
    a: "Most facilities can be live within a few days once courts, rates and PayMongo are ready.",
  },
];

/* ---------------------------------------------------------------- page */

export default function DemoLandingPage() {
  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden">
      <TopBar />
      <main id="main" className="flex-1">
        <HeroSection />
        <PaymentStrip />
        <FeaturesSection />
        <OpenPlaySection />
        <DashboardSection />
        <HowSection />
        <FaqSection />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}

/* ------------------------------------------------------------ sections */

function TopBar() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-ink/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/demo" aria-label="EzPickle for Facilities">
          <Logo />
        </Link>
        <nav aria-label="Page sections" className="hidden items-center gap-1 md:flex">
          {NAV.map(([label, href]) => (
            <a
              key={href}
              href={href}
              className="rounded-full px-3.5 py-2 text-sm text-white/70 transition-colors hover:bg-white/5 hover:text-white"
            >
              {label}
            </a>
          ))}
        </nav>
        <PrimaryCta href={DEMO_MAILTO} size="sm">
          Book a demo
        </PrimaryCta>
      </div>
    </header>
  );
}

function HeroSection() {
  return (
    <section className="relative">
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
        <div className="ezp-grid-lines absolute inset-0 opacity-60" />
        <div className="absolute -left-32 top-0 size-[30rem] rounded-full bg-pickle-500/20 blur-[120px]" />
        <div className="absolute -right-24 bottom-0 size-[26rem] rounded-full bg-pickle-700/25 blur-[120px]" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-ink" />
      </div>

      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-14 sm:px-6 sm:pt-20 lg:grid-cols-[1.05fr_1fr] lg:pb-28">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-pickle-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-pickle-300 ring-1 ring-inset ring-pickle-500/30">
            <span className="size-1.5 animate-pulseDot rounded-full bg-pickle-500" />
            For pickleball facility owners
          </span>
          <h1 className="mt-6 text-[2.5rem] font-extrabold leading-[1.04] tracking-tight sm:text-6xl">
            Fill your courts.
            <br />
            Get paid upfront.
            <br />
            <span className="text-pickle-500">Skip the chaos.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/70">
            EzPickle is the all-in-one booking and operations platform for Philippine pickleball facilities —
            online reservations, GCash and Maya payments, QR check-in, Open Play stacking, inventory and reports.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <PrimaryCta href={DEMO_MAILTO}>
              Book a free demo <ArrowRight size={18} aria-hidden />
            </PrimaryCta>
            <Link
              href="/book"
              className="inline-flex h-12 items-center gap-2 rounded-full bg-white/5 px-6 text-sm font-semibold ring-1 ring-inset ring-white/15 transition-colors hover:bg-white/10"
            >
              Try the player experience
            </Link>
          </div>
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/60">
            {["No app download for players", "Your brand, your logo", "Payments go straight to you"].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <Check size={16} className="text-pickle-500" aria-hidden /> {t}
              </li>
            ))}
          </ul>
        </div>

        <AvailabilityMock />
      </div>
    </section>
  );
}

function PaymentStrip() {
  return (
    <section aria-label="Supported payment methods" className="border-y border-white/5 bg-ink-soft">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 py-6 sm:flex-row sm:justify-between sm:px-6">
        <p className="text-sm text-white/50">Players pay the way they already do, via PayMongo</p>
        <ul className="flex flex-wrap justify-center gap-2">
          {PAYMENT_METHODS.map((m) => (
            <li
              key={m}
              className="rounded-full bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-white/80 ring-1 ring-inset ring-white/10"
            >
              {m}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function FeaturesSection() {
  return (
    <section id="features" className="scroll-mt-20">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <SectionHeading
          eyebrow="Everything in one place"
          title="One platform for the front desk, the courts and the books"
          body="Replace the group chats, paper logbooks and spreadsheets with a system your players and staff will actually enjoy using."
        />
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <article
              key={title}
              className="group rounded-2xl border border-white/5 bg-ink-card p-6 transition-colors hover:border-pickle-500/30"
            >
              <span className="grid size-11 place-items-center rounded-xl bg-pickle-500/10 text-pickle-500 ring-1 ring-inset ring-pickle-500/25 transition-colors group-hover:bg-pickle-500 group-hover:text-ink">
                <Icon size={20} aria-hidden />
              </span>
              <h3 className="mt-5 text-lg font-bold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/60">{body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function OpenPlaySection() {
  return (
    <section id="open-play" className="scroll-mt-20 border-y border-white/5 bg-ink-soft">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-2">
        <div>
          <SectionHeading
            align="left"
            eyebrow="Open Play"
            title="Open Play nights that run themselves"
            body="Players sign up online and pay ahead. When it's full, new sign-ups join a waitlist automatically. On the night, the auto-stacker builds balanced games by skill level so nobody waits too long or plays lopsided matches."
          />
          <ul className="mt-8 space-y-3">
            {[
              "Online sign-up with capacity limits and waitlist",
              "Skill-balanced games generated in one tap",
              "Manual overrides when your staff knows better",
              "Players see their stack on their phone",
            ].map((t) => (
              <li key={t} className="flex items-start gap-3 text-white/80">
                <Check size={18} className="mt-0.5 shrink-0 text-pickle-500" aria-hidden /> {t}
              </li>
            ))}
          </ul>
        </div>
        <StackMock />
      </div>
    </section>
  );
}

function DashboardSection() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
      <SectionHeading
        eyebrow="For owners & managers"
        title="Know exactly how your facility is doing"
        body="Today's revenue, bookings, court utilization, pending payments and low-stock alerts — the moment you log in."
      />
      <div className="mt-14 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <DashboardMock />
        <ul className="grid content-start gap-3">
          {OWNER_WINS.map((t) => (
            <li key={t} className="flex items-start gap-3 rounded-xl border border-white/5 bg-ink-card p-4 text-sm">
              <ShieldCheck size={18} className="mt-0.5 shrink-0 text-pickle-500" aria-hidden />
              <span className="text-white/80">{t}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function HowSection() {
  return (
    <section id="how" className="scroll-mt-20 border-y border-white/5 bg-ink-soft">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <SectionHeading eyebrow="Getting started" title="Live in three simple steps" />
        <ol className="mt-14 grid gap-4 md:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n} className="relative rounded-2xl border border-white/5 bg-ink-card p-7">
              <span className="text-4xl font-extrabold text-pickle-500/80">{s.n}</span>
              <h3 className="mt-4 text-lg font-bold">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/60">{s.body}</p>
            </li>
          ))}
        </ol>
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {[
            [Clock, "Asia/Manila time", "Every slot, receipt and report in local time."],
            [Smartphone, "Mobile-first", "Designed for players booking from their phone."],
            [Zap, "Real-time", "Availability updates live for every visitor."],
          ].map(([Icon, title, body]) => {
            const I = Icon as typeof Clock;
            return (
              <div key={title as string} className="flex items-start gap-3">
                <I size={20} className="mt-0.5 shrink-0 text-pickle-500" aria-hidden />
                <div>
                  <p className="font-semibold">{title as string}</p>
                  <p className="text-sm text-white/55">{body as string}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FaqSection() {
  return (
    <section id="faq" className="scroll-mt-20">
      <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6 sm:py-28">
        <SectionHeading eyebrow="FAQ" title="Questions facility owners ask us" />
        <div className="mt-12 divide-y divide-white/5 rounded-2xl border border-white/5 bg-ink-card">
          {FAQ.map(({ q, a }) => (
            <details key={q} className="group px-6 py-5 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                {q}
                <span
                  aria-hidden
                  className="grid size-7 shrink-0 place-items-center rounded-full bg-white/5 text-pickle-500 transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-white/65">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="px-4 pb-24 sm:px-6">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-pickle-500 px-6 py-14 text-ink sm:px-14 sm:py-20">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-20 size-80 rounded-full bg-pickle-300/60 blur-3xl"
        />
        <div className="relative max-w-2xl">
          <h2 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            Ready to see it with your own courts?
          </h2>
          <p className="mt-4 text-lg text-ink/75">
            Get a 20-minute walkthrough. We&apos;ll load your courts and rates so you can see exactly how it would
            look for your players.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href={DEMO_MAILTO}
              className="inline-flex h-12 items-center gap-2 rounded-full bg-ink px-6 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5"
            >
              <Mail size={18} aria-hidden /> Book a demo
            </a>
            <Link
              href="/"
              className="inline-flex h-12 items-center gap-2 rounded-full bg-ink/10 px-6 text-sm font-semibold ring-1 ring-inset ring-ink/25 transition-colors hover:bg-ink/15"
            >
              Explore the live site <ArrowRight size={18} aria-hidden />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/5">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-white/50 sm:flex-row sm:px-6">
        <Logo />
        <p>Pickleball facility software, made for the Philippines.</p>
        <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-white">
          {CONTACT_EMAIL}
        </a>
      </div>
    </footer>
  );
}

/* ------------------------------------------------------- illustrations */

const COURTS = ["Court 1", "Court 2", "Court 3", "Court 4"];
const HOURS = ["6 PM", "7 PM", "8 PM", "9 PM", "10 PM"];
// b = booked, o = open play, m = maintenance, "" = available, s = selected
const GRID: string[][] = [
  ["b", "b", "", "s", ""],
  ["", "b", "b", "b", ""],
  ["o", "o", "o", "", "b"],
  ["", "", "m", "b", "b"],
];

function AvailabilityMock() {
  return (
    <figure
      aria-label="Illustration of the live court availability grid"
      className="relative rounded-3xl border border-white/10 bg-ink-card/90 p-5 shadow-glow backdrop-blur sm:p-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-white/40">Tonight</p>
          <p className="font-bold">Live availability</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-pickle-500/10 px-2.5 py-1 text-xs font-semibold text-pickle-300">
          <span className="size-1.5 animate-pulseDot rounded-full bg-pickle-500" /> Live
        </span>
      </div>

      <div className="mt-5 overflow-hidden">
        <div className="grid grid-cols-[4.5rem_repeat(5,1fr)] gap-1.5 text-[11px]">
          <span />
          {HOURS.map((h) => (
            <span key={h} className="text-center text-white/40">
              {h}
            </span>
          ))}
          {COURTS.map((c, r) => (
            <Row key={c} label={c} cells={GRID[r]} />
          ))}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-white/50">
        <Legend className="bg-white/5 ring-1 ring-inset ring-white/10" label="Available" />
        <Legend className="bg-white/15" label="Booked" />
        <Legend className="bg-pickle-700/60" label="Open Play" />
        <Legend className="bg-pickle-500" label="Your pick" />
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl bg-white/5 p-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">Court 1 · 9:00 – 10:00 PM</p>
          <p className="text-xs text-white/50">Pay with GCash, Maya or card</p>
        </div>
        <span className="shrink-0 rounded-full bg-pickle-500 px-4 py-2 text-xs font-bold text-ink">Reserve</span>
      </div>

      <div className="absolute -bottom-5 -left-3 hidden items-center gap-2 rounded-2xl border border-white/10 bg-ink px-4 py-3 text-sm shadow-card sm:flex">
        <Check size={16} className="text-pickle-500" aria-hidden />
        <span>
          Payment received · <span className="text-white/60">GCash</span>
        </span>
      </div>
    </figure>
  );
}

function Row({ label, cells }: { label: string; cells: string[] }) {
  const style: Record<string, string> = {
    "": "bg-white/5 ring-1 ring-inset ring-white/10",
    b: "bg-white/15",
    o: "bg-pickle-700/60",
    m: "bg-[repeating-linear-gradient(45deg,rgba(255,255,255,0.08)_0_4px,transparent_4px_8px)] ring-1 ring-inset ring-white/10",
    s: "bg-pickle-500 shadow-glow",
  };
  return (
    <>
      <span className="flex items-center text-white/60">{label}</span>
      {cells.map((c, i) => (
        <span key={i} className={`h-9 rounded-lg ${style[c]}`} />
      ))}
    </>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`size-3 rounded ${className}`} /> {label}
    </span>
  );
}

const GAMES = [
  { court: "Court 1", a: ["Ana C.", "Miguel R."], b: ["Joy T.", "Paolo D."], level: "3.5" },
  { court: "Court 2", a: ["Bea S.", "Carlo M."], b: ["Rina V.", "Josh L."], level: "3.0" },
  { court: "Court 3", a: ["Kat P.", "Leo G."], b: ["Mae F.", "Nico B."], level: "2.5" },
];

function StackMock() {
  return (
    <figure
      aria-label="Illustration of the Open Play auto-stacker"
      className="rounded-3xl border border-white/10 bg-ink-card p-5 shadow-card sm:p-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-white/40">Thursday Open Play</p>
          <p className="font-bold">Round 4 stack</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1 text-xs text-white/70">
          <Users size={14} aria-hidden /> 24 / 24 · 3 waitlisted
        </span>
      </div>
      <ul className="mt-5 space-y-3">
        {GAMES.map((g) => (
          <li key={g.court} className="rounded-2xl bg-white/5 p-4">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-pickle-300">{g.court}</span>
              <span className="text-white/40">Avg level {g.level}</span>
            </div>
            <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-sm">
              <span className="truncate">{g.a.join(" & ")}</span>
              <span className="text-xs font-bold text-white/30">VS</span>
              <span className="truncate text-right">{g.b.join(" & ")}</span>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-5 flex items-center gap-2 rounded-full bg-pickle-500 px-4 py-2.5 text-sm font-bold text-ink">
        <Shuffle size={16} aria-hidden /> Generate next round
      </div>
    </figure>
  );
}

const BARS = [42, 55, 48, 63, 71, 88, 94];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function DashboardMock() {
  return (
    <figure
      aria-label="Illustration of the admin dashboard with sample numbers"
      className="rounded-3xl border border-white/10 bg-ink-card p-5 shadow-card sm:p-6"
    >
      <div className="flex items-center justify-between">
        <p className="font-bold">Dashboard</p>
        <span className="text-xs text-white/40">Sample data</span>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Today's revenue", "₱18,400"],
          ["Bookings", "32"],
          ["Utilization", "78%"],
          ["Low stock", "2 items"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl bg-white/5 p-3.5">
            <p className="text-[11px] text-white/45">{label}</p>
            <p className="mt-1 text-lg font-extrabold">{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-6">
        <p className="text-xs text-white/45">Court utilization, this week</p>
        <div className="mt-3 flex h-40 items-end gap-2 sm:gap-3">
          {BARS.map((v, i) => (
            <div key={DAYS[i]} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
              <div
                className={`w-full rounded-t-lg ${i >= 5 ? "bg-pickle-500" : "bg-pickle-500/40"}`}
                style={{ height: `${v}%` }}
              />
              <span className="text-[10px] text-white/40">{DAYS[i]}</span>
            </div>
          ))}
        </div>
      </div>
    </figure>
  );
}

/* ------------------------------------------------------------- helpers */

function SectionHeading({
  eyebrow,
  title,
  body,
  align = "center",
}: {
  eyebrow: string;
  title: string;
  body?: string;
  align?: "center" | "left";
}) {
  const center = align === "center";
  return (
    <div className={center ? "mx-auto max-w-2xl text-center" : "max-w-xl"}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-pickle-500">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">{title}</h2>
      {body && <p className="mt-4 leading-relaxed text-white/60">{body}</p>}
    </div>
  );
}

function PrimaryCta({
  href,
  children,
  size = "md",
}: {
  href: string;
  children: React.ReactNode;
  size?: "sm" | "md";
}) {
  return (
    <a
      href={href}
      className={`inline-flex items-center gap-2 rounded-full bg-pickle-500 font-semibold text-ink shadow-[0_8px_30px_-12px_rgba(111,207,43,0.7)] transition-colors hover:bg-pickle-400 ${
        size === "sm" ? "h-9 px-4 text-[13px]" : "h-12 px-6 text-sm"
      }`}
    >
      {children}
    </a>
  );
}
