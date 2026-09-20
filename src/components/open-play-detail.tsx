"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, Clock3, CreditCard, Users } from "lucide-react";
import { api, ApiError } from "@/lib/client";
import { useRealtime } from "@/hooks/use-realtime";
import { useToast } from "./ui/toast";
import { Button } from "./ui/button";
import { Badge, Card, Field, inputClass, Skeleton } from "./ui/primitives";
import { CapacityBar } from "./open-play-capacity";
import { peso } from "@/lib/utils";

type Player = { id: string; name: string; avatarUrl: string | null; status: string; rating: number | null };
type Group = {
  id: string;
  label: string;
  court: string;
  avgRating: number | null;
  players: { id: string; name: string; rating: number | null }[];
};
type Detail = {
  session: {
    id: string;
    title: string;
    startAt: string;
    endAt: string;
    skillLevel: string;
    pricePerPlayer: number;
    maxPlayers: number;
    minPlayers: number;
    courtCount: number;
    playersPerCourt: number;
    status: string;
    notes: string | null;
  };
  taken: number;
  players: Player[];
  groups: Group[];
  waitlistCount: number;
  me: { id: string; status: string; holdExpiresAt: string | null } | null;
  myWaitlist: { status: string; position: number; offerExpiresAt: string | null } | null;
};

const SKILL_LABEL: Record<string, string> = {
  BEGINNER: "Beginner",
  INTERMEDIATE: "Intermediate",
  ADVANCED: "Advanced",
  OPEN: "All levels",
};

function fmt(iso: string, opts: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", ...opts }).format(
    new Date(iso),
  );
}

export function OpenPlayDetail({ sessionId, signedIn }: { sessionId: string; signedIn: boolean }) {
  const router = useRouter();
  const toast = useToast();

  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [rating, setRating] = useState("3.5");

  const load = useCallback(async () => {
    try {
      setData(await api<Detail>(`/api/open-play/${sessionId}`));
    } catch {
      toast.push("We couldn't load this session. Please refresh.", "error");
    } finally {
      setLoading(false);
    }
  }, [sessionId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  // Roster changes from other customers arrive over SSE.
  useRealtime("openplay", (event) => {
    const payload = event as { sessionId?: string };
    if (payload?.sessionId === sessionId) void load();
  });

  async function pay(playerId: string) {
    const result = await api<{ checkoutUrl?: string; alreadyPaid?: boolean }>("/api/checkout", {
      body: { openPlayPlayerId: playerId },
    });
    if (result.checkoutUrl) window.location.href = result.checkoutUrl;
    else void load();
  }

  async function join() {
    if (!signedIn) {
      router.push(`/login?next=${encodeURIComponent(`/open-play/${sessionId}`)}`);
      return;
    }
    setBusy(true);
    try {
      const result = await api<{ playerId: string }>(`/api/open-play/${sessionId}/join`, {
        body: { skillRating: Number(rating) },
      });
      toast.push("Seat reserved — complete payment to lock it in.");
      await pay(result.playerId);
    } catch (error) {
      toast.push(
        error instanceof ApiError ? error.message : "Something went wrong. Please try again.",
        "error",
      );
      void load();
    } finally {
      setBusy(false);
    }
  }

  async function leave() {
    setBusy(true);
    try {
      await api(`/api/open-play/${sessionId}/join`, { method: "DELETE" });
      toast.push("You've left this session.", "info");
      await load();
    } catch (error) {
      toast.push(error instanceof ApiError ? error.message : "Couldn't leave the session.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function waitlist() {
    if (!signedIn) {
      router.push(`/login?next=${encodeURIComponent(`/open-play/${sessionId}`)}`);
      return;
    }
    setBusy(true);
    try {
      const result = await api<{ ahead: number }>(`/api/open-play/${sessionId}/waitlist`, {
        body: {},
      });
      toast.push(
        result.ahead === 0
          ? "You're next in line. We'll notify you if a seat opens."
          : `You're on the waitlist with ${result.ahead} ahead of you.`,
      );
      await load();
    } catch (error) {
      toast.push(error instanceof ApiError ? error.message : "Couldn't join the waitlist.", "error");
    } finally {
      setBusy(false);
    }
  }

  if (loading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const { session, taken } = data;
  const full = taken >= session.maxPlayers;
  const awaitingPayment = data.me?.status === "PENDING_PAYMENT";

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              {session.title}
            </h1>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/55">
              <span className="flex items-center gap-2">
                <CalendarDays size={15} className="text-pickle-500" aria-hidden />
                {fmt(session.startAt, { weekday: "long", day: "numeric", month: "long" })}
              </span>
              <span className="flex items-center gap-2">
                <Clock3 size={15} className="text-pickle-500" aria-hidden />
                {fmt(session.startAt, { hour: "numeric", minute: "2-digit" })} –{" "}
                {fmt(session.endAt, { hour: "numeric", minute: "2-digit" })}
              </span>
              <span className="flex items-center gap-2">
                <Users size={15} className="text-pickle-500" aria-hidden />
                {session.courtCount} courts · {session.playersPerCourt} per court
              </span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge tone={full ? "amber" : "green"}>{full ? "Full" : "Open"}</Badge>
            <Badge>{SKILL_LABEL[session.skillLevel] ?? session.skillLevel}</Badge>
          </div>
        </div>

        <div className="mt-6">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-semibold text-white/85">
              <motion.span
                key={taken}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28 }}
                className="inline-block tabular-nums text-pickle-400"
              >
                {taken}
              </motion.span>{" "}
              / {session.maxPlayers} players
            </span>
            <span className="text-white/45">{peso(session.pricePerPlayer)} per player</span>
          </div>
          <CapacityBar taken={taken} max={session.maxPlayers} className="mt-2" />
          {data.waitlistCount > 0 && (
            <p className="mt-2 text-xs text-white/40">{data.waitlistCount} on the waitlist</p>
          )}
        </div>

        {session.notes && <p className="mt-5 text-sm text-white/55">{session.notes}</p>}

        <div className="mt-6 border-t border-white/10 pt-5">
          {awaitingPayment ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="flex-1 text-sm text-amber-300">
                Your seat is held pending payment. Complete it to confirm your spot.
              </p>
              <Button onClick={() => data.me && pay(data.me.id)} loading={busy}>
                <CreditCard size={16} aria-hidden />
                Pay {peso(session.pricePerPlayer)}
              </Button>
              <Button variant="ghost" onClick={leave} disabled={busy}>
                Cancel
              </Button>
            </div>
          ) : data.me ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="flex-1 text-sm text-pickle-300">
                You&rsquo;re in. See you on the court.
              </p>
              <Button variant="secondary" onClick={leave} loading={busy}>
                Leave session
              </Button>
            </div>
          ) : data.myWaitlist ? (
            <p className="text-sm text-amber-300">
              You&rsquo;re on the waitlist at position {data.myWaitlist.position}. We&rsquo;ll email
              you the moment a seat opens.
            </p>
          ) : full ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="flex-1 text-sm text-white/55">
                This session is full. Join the waitlist and we&rsquo;ll offer you the next
                cancellation.
              </p>
              <Button variant="secondary" onClick={waitlist} loading={busy}>
                Join waitlist
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-40">
                <Field label="Your skill rating" hint="DUPR-style, 1.0 – 8.0">
                  <input
                    className={inputClass}
                    inputMode="decimal"
                    value={rating}
                    onChange={(e) => setRating(e.target.value)}
                  />
                </Field>
              </div>
              <Button onClick={join} loading={busy} size="lg">
                Join for {peso(session.pricePerPlayer)}
              </Button>
            </div>
          )}
        </div>
      </Card>

      {data.groups.length > 0 && (
        <section aria-labelledby="stack-heading">
          <h2 id="stack-heading" className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-white/40">
            Open Play stack
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.groups.map((group, groupIndex) => (
              <motion.div
                key={group.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: groupIndex * 0.12, ease: [0.22, 1, 0.36, 1] }}
              >
                <Card>
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-white">{group.court}</h3>
                    {group.avgRating != null && (
                      <span className="text-xs text-white/40">avg {group.avgRating.toFixed(2)}</span>
                    )}
                  </div>
                  <ul className="mt-3 space-y-2">
                    <AnimatePresence initial={false}>
                      {group.players.map((player, playerIndex) => (
                        <motion.li
                          key={player.id}
                          layout
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 10 }}
                          transition={{
                            duration: 0.32,
                            delay: groupIndex * 0.12 + playerIndex * 0.06,
                            ease: [0.22, 1, 0.36, 1],
                          }}
                          className="flex items-center justify-between rounded-xl bg-white/[0.04] px-3 py-2 text-sm"
                        >
                          <span className="text-white/85">{player.name}</span>
                          {player.rating != null && (
                            <span className="text-xs tabular-nums text-white/35">
                              {player.rating.toFixed(1)}
                            </span>
                          )}
                        </motion.li>
                      ))}
                    </AnimatePresence>
                  </ul>
                </Card>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="roster-heading">
        <h2 id="roster-heading" className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-white/40">
          Who&rsquo;s playing
        </h2>
        <Card>
          {data.players.length === 0 ? (
            <p className="py-4 text-center text-sm text-white/40">
              Nobody yet — be the first to sign up.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              <AnimatePresence initial={false}>
                {data.players.map((player) => (
                  <motion.li
                    key={player.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                    className="flex items-center gap-2 rounded-full bg-white/[0.05] py-1.5 pl-1.5 pr-3.5 text-sm"
                  >
                    <span className="flex size-7 items-center justify-center rounded-full bg-pickle-500/20 text-[11px] font-bold text-pickle-300">
                      {player.name.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="text-white/80">{player.name}</span>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}
