"use client";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Crown, RotateCcw, Shuffle, Trophy, X } from "lucide-react";
import { api, ApiError } from "@/lib/client";
import { useToast } from "./ui/toast";
import { Button } from "./ui/button";
import { Badge, Card } from "./ui/primitives";
import { cn } from "@/lib/utils";

type CourtPlayer = { id: string; name: string; rating: number | null };
type NamedId = { id: string; name: string };

export type StackGroup = {
  id: string;
  label: string;
  court: string;
  avgRating: number | null;
  players: CourtPlayer[];
  teamA: CourtPlayer[];
  teamB: CourtPlayer[];
  game: { id: string; scoreA: number; scoreB: number } | null;
};

export type StackGame = {
  id: string;
  roundIndex: number;
  court: string;
  teamA: NamedId[];
  teamB: NamedId[];
  scoreA: number;
  scoreB: number;
};

export type PlayerRecord = {
  wins: number;
  losses: number;
  played: number;
  pointsFor: number;
  pointsAgainst: number;
};

type Props = {
  sessionId: string;
  round: number;
  groups: StackGroup[];
  bench: CourtPlayer[];
  games: StackGame[];
  operator: NamedId | null;
  canOperate: boolean;
  me: { id: string; groupId: string | null; record: PlayerRecord } | null;
  onChanged: () => Promise<void> | void;
};

function names(players: { name: string }[]) {
  return players.map((p) => p.name).join(" & ") || "—";
}

/**
 * The live stack, as every member of the session sees it — plus the
 * operator's controls when the viewer is the assigned operator (or an admin).
 */
export function OpenPlayStack(props: Props) {
  const { sessionId, round, groups, bench, games, operator, canOperate, me } = props;
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function act(key: string, fn: () => Promise<unknown>, success?: string) {
    setBusy(key);
    try {
      await fn();
      if (success) toast.push(success);
      await props.onChanged();
    } catch (error) {
      toast.push(error instanceof ApiError ? error.message : "Something went wrong.", "error");
    } finally {
      setBusy(null);
    }
  }

  const stack = (roundIndex: number) =>
    act(
      `stack-${roundIndex}`,
      () => api(`/api/open-play/${sessionId}/stack`, { body: { roundIndex } }),
      `Round ${roundIndex} is up.`,
    );

  const move = (playerId: string, groupId: string | null) =>
    act(`move-${playerId}`, () =>
      api(`/api/open-play/${sessionId}/stack`, { method: "PATCH", body: { playerId, groupId } }),
    );

  const myGroup = me?.groupId ? groups.find((g) => g.id === me.groupId) : null;
  const myGames = me
    ? games.filter((g) => g.teamA.some((p) => p.id === me.id) || g.teamB.some((p) => p.id === me.id))
    : [];

  if (!canOperate && !operator && groups.length === 0 && games.length === 0) return null;

  return (
    <div className="space-y-6">
      <section aria-labelledby="stack-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2
            id="stack-heading"
            className="text-sm font-semibold uppercase tracking-[0.16em] text-white/40"
          >
            Open Play stack{round > 0 && <span className="text-pickle-400"> · Round {round}</span>}
          </h2>
          {operator && (
            <span className="flex items-center gap-1.5 text-xs text-white/50">
              <Crown size={13} className="text-amber-300" aria-hidden />
              Operator: <span className="font-semibold text-white/80">{operator.name}</span>
            </span>
          )}
        </div>

        {canOperate && (
          <Card className="border-amber-400/25 bg-amber-400/[0.04]">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex-1 text-sm">
                <p className="font-semibold text-amber-200">You&rsquo;re running the stack</p>
                <p className="mt-0.5 text-xs text-white/45">
                  Record each court&rsquo;s score, then start the next round. Everyone in this session
                  sees the courts update live.
                </p>
              </div>
              {round > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={busy === `stack-${round}`}
                  disabled={busy !== null}
                  onClick={() => {
                    if (confirm(`Re-shuffle round ${round}? Courts will be re-assigned.`)) void stack(round);
                  }}
                >
                  <RotateCcw size={14} aria-hidden />
                  Re-shuffle
                </Button>
              )}
              <Button
                size="sm"
                loading={busy === `stack-${round + 1}`}
                disabled={busy !== null}
                onClick={() => void stack(round + 1)}
              >
                <Shuffle size={14} aria-hidden />
                {round === 0 ? "Start round 1" : `Next round (${round + 1})`}
              </Button>
            </div>
          </Card>
        )}

        {me && round > 0 && (
          <div
            className={cn(
              "rounded-2xl px-4 py-3 text-sm",
              myGroup
                ? "bg-pickle-500/15 text-pickle-200 ring-1 ring-inset ring-pickle-500/30"
                : "bg-white/[0.04] text-white/60",
            )}
          >
            {myGroup ? (
              <>
                You&rsquo;re on <span className="font-bold text-white">{myGroup.court}</span>
                {(() => {
                  const onA = myGroup.teamA.some((p) => p.id === me.id);
                  const mine = onA ? myGroup.teamA : myGroup.teamB;
                  const them = onA ? myGroup.teamB : myGroup.teamA;
                  const partner = mine.filter((p) => p.id !== me.id);
                  return (
                    <>
                      {partner.length > 0 && <> with {names(partner)}</>} vs {names(them)}
                    </>
                  );
                })()}
              </>
            ) : (
              <>You&rsquo;re sitting out this round — you&rsquo;ll be up next.</>
            )}
          </div>
        )}

        {groups.length === 0 ? (
          <Card>
            <p className="py-3 text-center text-sm text-white/40">
              {canOperate
                ? "No courts assigned yet. Start round 1 once players are paid."
                : `Waiting for ${operator?.name ?? "the operator"} to start round 1.`}
            </p>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((group, groupIndex) => (
              <motion.div
                key={group.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: groupIndex * 0.08, ease: [0.22, 1, 0.36, 1] }}
              >
                <CourtCard
                  key={`${group.id}:${group.game ? `${group.game.scoreA}-${group.game.scoreB}` : ""}`}
                  group={group}
                  groups={groups}
                  meId={me?.id ?? null}
                  canOperate={canOperate}
                  busy={busy}
                  onMove={move}
                  onScore={(scoreA, scoreB) =>
                    act(
                      `score-${group.id}`,
                      () =>
                        api(`/api/open-play/${sessionId}/games`, {
                          body: { groupId: group.id, scoreA, scoreB },
                        }),
                      `${group.court} score saved.`,
                    )
                  }
                />
              </motion.div>
            ))}
          </div>
        )}

        {bench.length > 0 && (
          <Card>
            <p className="text-[11px] uppercase tracking-[0.14em] text-white/35">
              Sitting out ({bench.length})
            </p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {bench.map((player) => (
                <li
                  key={player.id}
                  className={cn(
                    "flex items-center gap-2 rounded-full bg-white/[0.05] py-1 pl-3 pr-1.5 text-sm text-white/75",
                    player.id === me?.id && "ring-1 ring-pickle-500/50",
                  )}
                >
                  {player.name}
                  {canOperate && groups.length > 0 ? (
                    <select
                      className="rounded-full bg-ink px-2 py-1 text-xs text-white/70"
                      value=""
                      disabled={busy !== null}
                      onChange={(e) => e.target.value && void move(player.id, e.target.value)}
                      aria-label={`Put ${player.name} on a court`}
                    >
                      <option value="">Put on…</option>
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.court}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="pr-1.5" />
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      {me && (
        <section aria-labelledby="record-heading" className="space-y-3">
          <h2
            id="record-heading"
            className="text-sm font-semibold uppercase tracking-[0.16em] text-white/40"
          >
            My record
          </h2>
          <Card>
            <div className="grid grid-cols-3 gap-3 text-center">
              <Stat label="Wins" value={me.record.wins} tone="text-pickle-400" />
              <Stat label="Losses" value={me.record.losses} tone="text-red-300" />
              <Stat
                label="Point diff"
                value={me.record.pointsFor - me.record.pointsAgainst}
                signed
                tone="text-white"
              />
            </div>
            {myGames.length === 0 ? (
              <p className="mt-4 text-center text-sm text-white/35">
                No games recorded for you yet.
              </p>
            ) : (
              <ul className="mt-4 space-y-1.5">
                {myGames.map((g) => {
                  const onA = g.teamA.some((p) => p.id === me.id);
                  const mine = onA ? g.scoreA : g.scoreB;
                  const theirs = onA ? g.scoreB : g.scoreA;
                  const partner = (onA ? g.teamA : g.teamB).filter((p) => p.id !== me.id);
                  const won = mine > theirs;
                  return (
                    <li
                      key={g.id}
                      className="flex items-center gap-3 rounded-xl bg-white/[0.04] px-3 py-2 text-sm"
                    >
                      <Badge tone={won ? "green" : "red"}>{won ? "W" : "L"}</Badge>
                      <span className="min-w-0 flex-1 truncate text-white/70">
                        R{g.roundIndex} · {g.court}
                        {partner.length > 0 && <> · with {names(partner)}</>} · vs{" "}
                        {names(onA ? g.teamB : g.teamA)}
                      </span>
                      <span className="font-semibold tabular-nums text-white">
                        {mine}–{theirs}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </section>
      )}

      {games.length > 0 && (
        <section aria-labelledby="results-heading" className="space-y-3">
          <h2
            id="results-heading"
            className="text-sm font-semibold uppercase tracking-[0.16em] text-white/40"
          >
            All results
          </h2>
          <Card>
            <ul className="space-y-1.5">
              {[...games].reverse().map((g) => (
                <li
                  key={g.id}
                  className="flex items-center gap-3 rounded-xl bg-white/[0.03] px-3 py-2 text-sm"
                >
                  <span className="w-20 shrink-0 text-xs text-white/35">
                    R{g.roundIndex} · {g.court}
                  </span>
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-right",
                      g.scoreA > g.scoreB ? "font-semibold text-white" : "text-white/55",
                    )}
                  >
                    {names(g.teamA)}
                  </span>
                  <span className="shrink-0 tabular-nums text-white">
                    {g.scoreA}–{g.scoreB}
                  </span>
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate",
                      g.scoreB > g.scoreA ? "font-semibold text-white" : "text-white/55",
                    )}
                  >
                    {names(g.teamB)}
                  </span>
                  {canOperate && (
                    <button
                      type="button"
                      className="shrink-0 rounded-full p-1 text-white/30 hover:bg-white/10 hover:text-red-300"
                      aria-label="Delete this result"
                      disabled={busy !== null}
                      onClick={() => {
                        if (!confirm("Delete this result?")) return;
                        void act(
                          `del-${g.id}`,
                          () =>
                            api(`/api/open-play/${sessionId}/games`, {
                              method: "DELETE",
                              body: { gameId: g.id },
                            }),
                          "Result deleted.",
                        );
                      }}
                    >
                      <X size={14} aria-hidden />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  signed,
}: {
  label: string;
  value: number;
  tone: string;
  signed?: boolean;
}) {
  return (
    <div className="rounded-xl bg-white/[0.03] py-3">
      <p className={cn("text-2xl font-bold tabular-nums", tone)}>
        {signed && value > 0 ? `+${value}` : value}
      </p>
      <p className="mt-0.5 text-[11px] uppercase tracking-[0.14em] text-white/35">{label}</p>
    </div>
  );
}

function CourtCard({
  group,
  groups,
  meId,
  canOperate,
  busy,
  onMove,
  onScore,
}: {
  group: StackGroup;
  groups: StackGroup[];
  meId: string | null;
  canOperate: boolean;
  busy: string | null;
  onMove: (playerId: string, groupId: string | null) => void;
  onScore: (scoreA: number, scoreB: number) => void;
}) {
  const [a, setA] = useState(group.game ? String(group.game.scoreA) : "");
  const [b, setB] = useState(group.game ? String(group.game.scoreB) : "");
  const mine = group.players.some((p) => p.id === meId);
  const winner = group.game ? (group.game.scoreA > group.game.scoreB ? "A" : "B") : null;

  const team = (side: "A" | "B", players: CourtPlayer[]) => (
    <ul className="space-y-1.5">
      <AnimatePresence initial={false}>
        {players.map((player) => (
          <motion.li
            key={player.id}
            layout
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            className={cn(
              "flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm",
              player.id === meId ? "bg-pickle-500/20 text-white" : "bg-white/[0.04] text-white/85",
              winner === side && "ring-1 ring-inset ring-pickle-500/40",
            )}
          >
            <span className="truncate">{player.name}</span>
            {canOperate ? (
              <select
                className="rounded-md bg-ink px-1.5 py-1 text-xs text-white/70"
                value={group.id}
                disabled={busy !== null}
                onChange={(e) => onMove(player.id, e.target.value || null)}
                aria-label={`Move ${player.name}`}
              >
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.court}
                  </option>
                ))}
                <option value="">Sit out</option>
              </select>
            ) : (
              player.rating != null && (
                <span className="text-xs tabular-nums text-white/35">{player.rating.toFixed(1)}</span>
              )
            )}
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );

  return (
    <Card className={cn(mine && "border-pickle-500/40")}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">{group.court}</h3>
        {group.game ? (
          <span className="flex items-center gap-1 text-xs font-semibold text-pickle-300">
            <Trophy size={12} aria-hidden />
            {group.game.scoreA}–{group.game.scoreB}
          </span>
        ) : (
          group.avgRating != null && (
            <span className="text-xs text-white/40">avg {group.avgRating.toFixed(2)}</span>
          )
        )}
      </div>

      <div className="mt-3 space-y-2">
        {team("A", group.teamA)}
        <p className="text-center text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">
          vs
        </p>
        {team("B", group.teamB)}
      </div>

      {canOperate && group.teamB.length > 0 && (
        <form
          className="mt-4 flex items-center gap-2 border-t border-white/10 pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            const sa = Number(a);
            const sb = Number(b);
            if (a === "" || b === "" || !Number.isInteger(sa) || !Number.isInteger(sb)) return;
            onScore(sa, sb);
          }}
        >
          <input
            inputMode="numeric"
            className="w-14 rounded-lg border border-white/12 bg-white/[0.03] px-2 py-1.5 text-center text-sm tabular-nums text-white"
            value={a}
            onChange={(e) => setA(e.target.value.replace(/\D/g, "").slice(0, 2))}
            aria-label="Top team score"
            placeholder="0"
          />
          <span className="text-white/30">–</span>
          <input
            inputMode="numeric"
            className="w-14 rounded-lg border border-white/12 bg-white/[0.03] px-2 py-1.5 text-center text-sm tabular-nums text-white"
            value={b}
            onChange={(e) => setB(e.target.value.replace(/\D/g, "").slice(0, 2))}
            aria-label="Bottom team score"
            placeholder="0"
          />
          <Button
            type="submit"
            size="sm"
            variant={group.game ? "secondary" : "primary"}
            className="ml-auto"
            loading={busy === `score-${group.id}`}
            disabled={busy !== null || a === "" || b === ""}
          >
            {group.game ? "Update" : "Save score"}
          </Button>
        </form>
      )}
    </Card>
  );
}
