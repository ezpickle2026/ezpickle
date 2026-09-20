import Link from "next/link";
import { ArrowRight, CalendarCheck, CreditCard, MapPin, ShieldCheck, Zap } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { peso } from "@/lib/utils";
import { formatManila, formatTimeLabel } from "@/lib/time";
import { Hero } from "@/components/hero";
import { Slideshow } from "@/components/slideshow";
import { Button } from "@/components/ui/button";
import { Badge, Card, Reveal } from "@/components/ui/primitives";
import { CourtCard } from "@/components/court-card";

export const revalidate = 120;

export default async function HomePage() {
  const [settings, courts, images, openPlay, rules] = await Promise.all([
    getSettings(),
    prisma.court.findMany({
      where: { active: true, deletedAt: null },
      orderBy: { number: "asc" },
      include: { images: { orderBy: { sortOrder: "asc" }, take: 1 } },
    }),
    prisma.facilityImage.findMany({
      where: { active: true },
      orderBy: [{ featured: "desc" }, { sortOrder: "asc" }],
      take: 8,
    }),
    prisma.openPlaySession.findMany({
      where: { status: { in: ["OPEN", "FULL"] }, startAt: { gte: new Date() } },
      orderBy: { startAt: "asc" },
      take: 3,
      include: {
        _count: {
          select: { players: { where: { status: { in: ["REGISTERED", "CHECKED_IN"] } } } },
        },
      },
    }),
    prisma.pricingRule.findMany({
      where: { active: true, scope: "COURT_HOURLY", courtId: null },
      orderBy: { pricePerHour: "asc" },
    }),
  ]);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SportsActivityLocation",
    name: settings.businessName,
    description:
      "Pickleball courts, coaching and Open Play sessions in Metro Manila. Book online and pay with GCash, Maya or card.",
    address: { "@type": "PostalAddress", streetAddress: settings.address, addressCountry: "PH" },
    telephone: settings.phone,
    email: settings.email,
    priceRange: "₱₱",
    openingHours: `Mo-Su ${String(Math.floor(settings.openingMin / 60)).padStart(2, "0")}:00-${String(
      Math.floor(settings.closingMin / 60),
    ).padStart(2, "0")}:00`,
    sport: "Pickleball",
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Hero />

      {/* ---------------- Facility slideshow ---------------- */}
      {images.length > 0 && (
        <section id="facilities" className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <Reveal>
            <SectionHeading
              eyebrow="The facility"
              title="Built for the game"
              description="Cushioned indoor courts, proper lighting, and somewhere decent to sit between games."
            />
          </Reveal>
          <Reveal delay={0.1} className="mt-8">
            <Slideshow slides={images} />
          </Reveal>
        </section>
      )}

      {/* ---------------- Courts ---------------- */}
      <section id="courts" className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <Reveal>
          <SectionHeading
            eyebrow="Our courts"
            title="Pick your court"
            description="Every court is bookable in 30-minute blocks with live availability."
          />
        </Reveal>

        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {courts.map((court, i) => (
            <Reveal key={court.id} delay={i * 0.07}>
              <CourtCard
                name={court.name}
                number={court.number}
                description={court.description}
                indoor={court.indoor}
                surface={court.surface}
                status={court.status}
                hourlyPrice={court.hourlyPrice}
                amenities={court.amenities}
                imageUrl={court.images[0]?.url ?? null}
              />
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------------- How it works ---------------- */}
      <section className="border-y border-white/10 bg-ink-soft">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <Reveal>
            <SectionHeading eyebrow="How it works" title="Court to court in four steps" />
          </Reveal>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: CalendarCheck, title: "Pick a time", body: "Choose your date and see every court's live status." },
              { icon: Zap, title: "We hold it", body: `Your slot is reserved for ${settings.holdMinutes} minutes while you pay.` },
              { icon: CreditCard, title: "Pay securely", body: "GCash, Maya, card or QR Ph through PayMongo." },
              { icon: ShieldCheck, title: "Scan and play", body: "Show your QR code at the desk. That's it." },
            ].map((step, i) => (
              <Reveal key={step.title} delay={i * 0.08}>
                <Card className="h-full">
                  <div className="grid size-10 place-items-center rounded-xl bg-pickle-500/12 text-pickle-400">
                    <step.icon size={19} aria-hidden />
                  </div>
                  <h3 className="mt-4 font-semibold">{step.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-white/50">{step.body}</p>
                </Card>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- Open Play ---------------- */}
      <section id="open-play" className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <Reveal>
          <SectionHeading
            eyebrow="Open Play"
            title="Come alone, leave with a crew"
            description="Pay per player. We sort everyone into balanced groups automatically, then rotate."
          />
        </Reveal>

        {openPlay.length > 0 ? (
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {openPlay.map((session, i) => {
              const pct = Math.round((session._count.players / session.maxPlayers) * 100);
              return (
                <Reveal key={session.id} delay={i * 0.08}>
                  <Link href={`/open-play/${session.id}`} className="block h-full">
                    <Card className="h-full transition hover:border-pickle-500/40 hover:shadow-glow">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-semibold leading-tight">{session.title}</h3>
                        <Badge tone={session.status === "FULL" ? "amber" : "green"}>
                          {session.status === "FULL" ? "Waitlist" : "Open"}
                        </Badge>
                      </div>
                      <p className="mt-2 text-sm text-white/50">
                        {formatManila(session.startAt, "EEE d MMM · h:mm a")} –{" "}
                        {formatManila(session.endAt, "h:mm a")}
                      </p>
                      <p className="mt-1 text-sm text-white/50">
                        {session.skillLevel.toLowerCase()} · {peso(session.pricePerPlayer)}/player
                      </p>

                      <div className="mt-5">
                        <div className="flex items-center justify-between text-xs text-white/50">
                          <span>
                            {session._count.players} / {session.maxPlayers} players
                          </span>
                          <span>{pct}%</span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/8">
                          <div
                            className="h-full rounded-full bg-pickle-500 transition-[width] duration-700"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </Card>
                  </Link>
                </Reveal>
              );
            })}
          </div>
        ) : (
          <Card className="mt-8 text-center text-sm text-white/50">
            No Open Play sessions scheduled right now. Check back soon, or{" "}
            <Link href="/book" className="text-pickle-400 hover:underline">
              book a court
            </Link>{" "}
            instead.
          </Card>
        )}

        <Reveal delay={0.2} className="mt-7">
          <Link href="/open-play">
            <Button variant="secondary">
              See all sessions
              <ArrowRight size={16} aria-hidden />
            </Button>
          </Link>
        </Reveal>
      </section>

      {/* ---------------- Pricing ---------------- */}
      <section id="pricing" className="border-t border-white/10 bg-ink-soft">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <Reveal>
            <SectionHeading
              eyebrow="Pricing"
              title="Straightforward hourly rates"
              description="Rates vary by time of day. The exact price is always shown before you pay."
            />
          </Reveal>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {(rules.length > 0
              ? rules.slice(0, 3).map((r) => ({
                  label: r.name,
                  price: r.pricePerHour,
                  detail: `${formatTimeLabel(r.startMin)} – ${formatTimeLabel(r.endMin)}`,
                }))
              : [{ label: "Standard", price: courts[0]?.hourlyPrice ?? 40000, detail: "All day" }]
            ).map((tier, i) => (
              <Reveal key={tier.label} delay={i * 0.08}>
                <Card className="h-full">
                  <p className="text-xs uppercase tracking-wider text-white/40">{tier.label}</p>
                  <p className="mt-2 text-3xl font-extrabold tracking-tight">
                    {peso(tier.price)}
                    <span className="text-base font-medium text-white/40">/hour</span>
                  </p>
                  <p className="mt-1.5 text-sm text-white/50">{tier.detail}</p>
                </Card>
              </Reveal>
            ))}
          </div>

          <p className="mt-6 text-xs text-white/35">
            {settings.cancellationPolicy}
          </p>
        </div>
      </section>

      {/* ---------------- CTA ---------------- */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl border border-pickle-500/25 bg-gradient-to-br from-pickle-700/25 via-ink-card to-ink-card px-6 py-12 text-center sm:px-12 sm:py-16">
            <div className="ezp-grid-lines absolute inset-0 opacity-30" aria-hidden />
            <div className="relative">
              <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
                The court is waiting.
              </h2>
              <p className="mx-auto mt-3 max-w-md text-white/55">
                Live availability, instant confirmation, no phone calls.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link href="/book">
                  <Button size="lg">
                    Book a Court
                    <ArrowRight size={18} aria-hidden />
                  </Button>
                </Link>
                <Link href="/register">
                  <Button size="lg" variant="secondary">
                    Create an account
                  </Button>
                </Link>
              </div>
              <p className="mt-8 inline-flex items-center gap-1.5 text-xs text-white/40">
                <MapPin size={13} aria-hidden />
                {settings.address}
              </p>
            </div>
          </div>
        </Reveal>
      </section>
    </>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="max-w-2xl">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-pickle-500">{eyebrow}</p>
      <h2 className="mt-2.5 text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h2>
      {description && <p className="mt-3 text-white/50">{description}</p>}
    </div>
  );
}
