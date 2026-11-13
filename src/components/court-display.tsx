"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Maximize } from "lucide-react";
import { api } from "@/lib/client";
import { useRealtime } from "@/hooks/use-realtime";
import { Logo } from "@/components/logo";

type DisplaySession = {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  rotationMins: number;
  players: {
    id: string;
    status: string;
    groupId: string | null;
    user: { fullName: string };
  }[];
  groups: {
    id: string;
    label: string;
    roundIndex: number;
    createdAt: string;
    court: { name: string } | null;
    players: { id: string; user: { fullName: string } }[];
  }[];
};

const PAID = new Set(["REGISTERED", "CHECKED_IN"]);
// Fallback refresh in case the realtime stream drops on the venue's network.
const POLL_MS = 30_000;
const FLASH_MS = 6_000;

function timeLabel(date: Date | string) {
  return new Intl.DateTimeFormat("en-PH", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  }).format(new Date(date));
}

/** "12:05" style countdown; never negative. */
function mmss(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Stable signature of who is on which court, so we only flash on real changes. */
function stackSignature(session: DisplaySession) {
  return session.groups
    .map((g) => `${g.id}:${g.players.map((p) => p.id).sort().join(",")}`)
    .sort()
    .join("|");
}

export function CourtDisplay({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<DisplaySession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const signature = useRef<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const load = useCallback(async () => {
    try {
      const result = await api<{ session: DisplaySession }>(`/api/admin/open-play/${sessionId}`);
      const next = stackSignature(result.session);
      // Flash on every change after the first load.
      if (signature.current !== null && signature.current !== next) {
        setFlash(true);
        clearTimeout(flashTimer.current);
        flashTimer.current = setTimeout(() => setFlash(false), FLASH_MS);
      }
      signature.current = next;
      setSession(result.session);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the session.");
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
    const poll = setInterval(load, POLL_MS);
    const clock = setInterval(() => setNow(new Date()), 1_000);
    return () => {
      clearInterval(poll);
      clearInterval(clock);
      clearTimeout(flashTimer.current);
    };
  }, [load]);

  useRealtime("openplay", (data) => {
    const event = data as { sessionId?: string };
    if (event.sessionId === sessionId) void load();
  });

  if (!session) {
    return (
      <main className="grid min-h-screen place-items-center bg-ink text-2xl text-white/50">
        {error ?? "Loading courts…"}
      </main>
    );
  }

  // Only the latest round is on court; older rounds are history.
  const round = Math.max(0, ...session.groups.map((g) => g.roundIndex));
  const courts = session.groups.filter((g) => g.roundIndex === round && g.players.length > 0);
  const nextUp = session.players.filter((p) => !p.groupId && PAID.has(p.status));

  // The round's clock starts when its stack was generated. Manual player moves
  // keep the same groups, so they do not reset the timer.
  const roundStart = courts.length
    ? Math.min(...courts.map((g) => new Date(g.createdAt).getTime()))
    : null;
  const remaining =
    roundStart != null ? roundStart + session.rotationMins * 60_000 - now.getTime() : null;
  const timeUp = remaining != null && remaining <= 0;
  const endingSoon = remaining != null && !timeUp && remaining <= 60_000;

  const cols =
    courts.length <= 1 ? "grid-cols-1" : courts.length <= 4 ? "grid-cols-2" : "grid-cols-3";

  return (
    <main className="flex h-screen flex-col gap-6 overflow-hidden bg-ink p-8 text-white">
      <header className="flex items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <Logo className="shrink-0" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{session.title}</h1>
            <p className="text-lg text-white/50">
              {timeLabel(session.startAt)} – {timeLabel(session.endAt)} · {session.rotationMins}-min
              rotations
            </p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          {round > 0 && (
            <span className="rounded-full bg-pickle-500 px-5 py-2 text-2xl font-bold text-ink">
              Round {round}
            </span>
          )}
          {remaining != null && (
            <motion.div
              animate={timeUp ? { opacity: [1, 0.35, 1] } : { opacity: 1 }}
              transition={timeUp ? { duration: 1, repeat: Infinity } : undefined}
              className={`rounded-2xl px-5 py-1 text-center ${
                timeUp
                  ? "bg-red-500 text-white"
                  : endingSoon
                    ? "bg-amber-400 text-ink"
                    : "bg-white/[0.06] text-white"
              }`}
              role="timer"
              aria-live="off"
            >
              <p className="text-xs font-bold uppercase tracking-[0.2em] opacity-70">
                {timeUp ? "Time's up" : "Time left"}
              </p>
              <p className="text-5xl font-extrabold tabular-nums leading-tight">
                {mmss(remaining)}
              </p>
            </motion.div>
          )}
          <span className="text-3xl font-semibold tabular-nums text-white/60">
            {timeLabel(now)}
          </span>
          <button
            type="button"
            onClick={() => void document.documentElement.requestFullscreen?.()}
            className="rounded-lg p-2 text-white/30 hover:bg-white/10 hover:text-white"
            aria-label="Full screen"
            title="Full screen"
          >
            <Maximize size={22} />
          </button>
        </div>
      </header>

      <AnimatePresence>
        {timeUp && !flash && (
          <motion.div
            key="time-up"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="rounded-2xl bg-red-500 py-3 text-center text-3xl font-extrabold uppercase tracking-wide text-white"
          >
            Time&apos;s up — please finish your game
          </motion.div>
        )}
        {flash && (
          <motion.div
            key="new-stack"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="rounded-2xl bg-pickle-500 py-3 text-center text-3xl font-extrabold uppercase tracking-wide text-ink"
          >
            New stack — please go to your court
          </motion.div>
        )}
      </AnimatePresence>

      <section className="flex min-h-0 flex-1 gap-6">
        {courts.length === 0 ? (
          <div className="grid flex-1 place-items-center rounded-3xl border border-white/10 text-3xl text-white/40">
            Waiting for the first stack…
          </div>
        ) : (
          <div className={`grid min-h-0 flex-1 auto-rows-fr gap-6 ${cols}`}>
            {courts.map((group, index) => (
              <motion.div
                key={`${group.id}-${signature.current}`}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={
                  flash
                    ? {
                        opacity: 1,
                        scale: 1,
                        boxShadow: [
                          "0 0 0 0 rgba(111,207,43,0)",
                          "0 0 0 6px rgba(111,207,43,0.9)",
                          "0 0 0 0 rgba(111,207,43,0)",
                        ],
                      }
                    : { opacity: 1, scale: 1 }
                }
                transition={{
                  delay: index * 0.08,
                  boxShadow: { duration: 1.2, repeat: 3 },
                }}
                className="flex min-h-0 flex-col rounded-3xl border border-white/10 bg-white/[0.04] p-6"
              >
                <p className="text-3xl font-bold text-pickle-400">
                  {group.court?.name ?? group.label}
                </p>
                <ul className="mt-4 grid flex-1 content-center gap-3">
                  {group.players.map((player) => (
                    <li
                      key={player.id}
                      className="truncate rounded-xl bg-white/[0.06] px-5 py-3 text-3xl font-semibold"
                    >
                      {player.user.fullName}
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
        )}

        <aside className="flex w-80 shrink-0 flex-col rounded-3xl border border-white/10 bg-white/[0.02] p-6">
          <p className="text-xl font-bold uppercase tracking-[0.14em] text-white/50">
            Next up ({nextUp.length})
          </p>
          {nextUp.length === 0 ? (
            <p className="mt-4 text-xl text-white/30">Everyone is on a court.</p>
          ) : (
            <ol className="mt-4 space-y-2 overflow-hidden">
              {nextUp.map((player, i) => (
                <li key={player.id} className="flex gap-3 truncate text-2xl text-white/85">
                  <span className="w-8 shrink-0 tabular-nums text-white/35">{i + 1}.</span>
                  <span className="truncate">{player.user.fullName}</span>
                </li>
              ))}
            </ol>
          )}
        </aside>
      </section>

      {error && <p className="text-center text-sm text-amber-300/70">Reconnecting… ({error})</p>}
    </main>
  );
}
