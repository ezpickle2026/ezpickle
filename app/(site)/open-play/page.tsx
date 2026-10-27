import Link from "next/link";
import type { Metadata } from "next";
import { Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatManila } from "@/lib/time";
import { peso } from "@/lib/utils";
import { Badge, Card, EmptyState, Reveal } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { CapacityBar } from "@/components/open-play-capacity";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Open Play",
  description:
    "Join an EzPickle Open Play session. Register as an individual, get automatically stacked into balanced groups and play more games.",
  alternates: { canonical: "/open-play" },
};

const SKILL_LABEL: Record<string, string> = {
  BEGINNER: "Beginner",
  INTERMEDIATE: "Intermediate",
  ADVANCED: "Advanced",
  OPEN: "All levels",
};

export default async function OpenPlayIndexPage() {
  const sessions = await prisma.openPlaySession.findMany({
    where: { status: { in: ["OPEN", "FULL", "IN_PROGRESS"] }, endAt: { gte: new Date() } },
    orderBy: { startAt: "asc" },
    take: 24,
    include: {
      _count: {
        select: {
          players: { where: { status: { in: ["PENDING_PAYMENT", "REGISTERED", "CHECKED_IN"] } } },
          waitlist: { where: { status: { in: ["WAITING", "OFFERED"] } } },
        },
      },
    },
  });

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:py-14">
      <header className="mb-8 max-w-2xl">
        <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-pickle-400">
          Open Play
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Come alone. Leave with a crew.
        </h1>
        <p className="mt-2 text-sm text-white/50">
          Register as an individual and our stacking system organises everyone into skill-balanced
          groups across the courts. No need to bring three friends.
        </p>
      </header>

      {sessions.length === 0 ? (
        <EmptyState
          title="No sessions scheduled yet"
          description="New Open Play sessions are posted every week. Check back soon or book a court in the meantime."
          action={
            <Link href="/book">
              <Button>Book a court</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sessions.map((session, index) => {
            const taken = session._count.players;
            const full = taken >= session.maxPlayers;

            return (
              <Reveal key={session.id} delay={Math.min(index * 0.05, 0.3)}>
                <Card className="flex h-full flex-col transition duration-300 hover:-translate-y-1 hover:border-pickle-500/40 hover:shadow-glow">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold text-white">{session.title}</h2>
                      <p className="mt-1 text-sm text-white/50">
                        {formatManila(session.startAt, "EEE d MMM")} ·{" "}
                        {formatManila(session.startAt, "h:mm a")} –{" "}
                        {formatManila(session.endAt, "h:mm a")}
                      </p>
                    </div>
                    <Badge tone={full ? "amber" : "green"}>{full ? "Full" : "Open"}</Badge>
                  </div>

                  <div className="mt-4 flex items-center gap-2 text-xs text-white/50">
                    <Users size={14} className="text-pickle-500" aria-hidden />
                    <span>
                      {taken} / {session.maxPlayers} players · {session.courtCount} courts
                    </span>
                  </div>

                  <CapacityBar taken={taken} max={session.maxPlayers} className="mt-2" />

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Badge>{SKILL_LABEL[session.skillLevel] ?? session.skillLevel}</Badge>
                    <Badge>{peso(session.pricePerPlayer)} / player</Badge>
                    {session._count.waitlist > 0 && (
                      <Badge tone="amber">{session._count.waitlist} waiting</Badge>
                    )}
                  </div>

                  <div className="mt-5 flex-1" />

                  <Link href={`/open-play/${session.id}`} className="mt-1">
                    <Button variant={full ? "secondary" : "primary"} className="w-full">
                      {full ? "Join waitlist" : "View session"}
                    </Button>
                  </Link>
                </Card>
              </Reveal>
            );
          })}
        </div>
      )}
    </div>
  );
}
