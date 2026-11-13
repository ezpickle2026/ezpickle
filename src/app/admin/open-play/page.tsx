"use client";
import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Crown, MonitorUp, Plus, Shuffle } from "lucide-react";
import { api } from "@/lib/client";
import {
  Badge,
  Button,
  Card,
  Cell as Td,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  Row,
  Skeleton,
  Table,
  fmtDate,
  fmtTime,
  inputClass,
  minutesToLabel,
  selectClass,
  useMutate,
  useResource,
} from "@/components/admin/ui";
import { peso } from "@/lib/utils";

type Session = {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  skillLevel: string;
  pricePerPlayer: number;
  courtCount: number;
  playersPerCourt: number;
  minPlayers: number;
  maxPlayers: number;
  status: string;
  _count: { players: number; waitlist: number; groups: number };
};

type SessionDetail = {
  id: string;
  title: string;
  operatorUserId: string | null;
  players: {
    id: string;
    status: string;
    skillRating: number | null;
    groupId: string | null;
    user: { id: string; fullName: string };
  }[];
  groups: {
    id: string;
    label: string;
    roundIndex: number;
    avgRating: number | null;
    court: { name: string } | null;
    players: { id: string; skillRating: number | null; user: { fullName: string } }[];
  }[];
  waitlist: { id: string; position: number; status: string; user: { fullName: string } }[];
};

const SKILLS = ["BEGINNER", "INTERMEDIATE", "ADVANCED", "OPEN"];

type ScreenInfo = { availLeft: number; availTop: number; availWidth: number; availHeight: number };

/**
 * Opens the full-screen court board in its own window. On Chrome/Edge it asks
 * for "window management" permission and places the window on the other
 * monitor; elsewhere it opens a normal window you drag across.
 */
async function openCourtDisplay(sessionId: string) {
  const url = `/display/open-play/${sessionId}`;
  const name = `ezp-display-${sessionId}`;
  let features = "popup,width=1280,height=720";

  try {
    const w = window as unknown as {
      getScreenDetails?: () => Promise<{ screens: ScreenInfo[]; currentScreen: ScreenInfo }>;
    };
    if (w.getScreenDetails) {
      const details = await w.getScreenDetails();
      const other = details.screens.find((screen) => screen !== details.currentScreen);
      if (other) {
        features = `popup,left=${other.availLeft},top=${other.availTop},width=${other.availWidth},height=${other.availHeight}`;
      }
    }
  } catch {
    /* permission denied or unsupported — fall back to a normal window */
  }

  window.open(url, name, features);
}

export default function AdminOpenPlayPage() {
  const { data, loading, reload } = useResource<{ sessions: Session[] }>("/api/admin/open-play");
  const [createOpen, setCreateOpen] = useState(false);
  const [manageId, setManageId] = useState<string | null>(null);

  return (
    <div>
      <PageHeader
        title="Open Play"
        description="Sessions, rosters, waitlists and the automatic stacker."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus size={16} aria-hidden />
            New session
          </Button>
        }
      />

      {loading && !data ? (
        <Skeleton className="h-64 w-full" />
      ) : !data || data.sessions.length === 0 ? (
        <EmptyState
          title="No Open Play sessions yet"
          description="Create one and customers can start signing up straight away."
        />
      ) : (
        <Table
          head={["Session", "When", "Level", "Players", "Waitlist", "Price", "Status", ""]}
          minWidth={980}
        >
          {data.sessions.map((session) => (
            <Row key={session.id}>
              <Td className="font-medium text-white/90">{session.title}</Td>
              <Td>
                {fmtDate(session.startAt, { weekday: "short" })} · {fmtTime(session.startAt)} –{" "}
                {fmtTime(session.endAt)}
              </Td>
              <Td className="capitalize">{session.skillLevel.toLowerCase()}</Td>
              <Td align="right" className="tabular-nums">
                {session._count.players} / {session.maxPlayers}
              </Td>
              <Td align="right" className="tabular-nums">
                {session._count.waitlist}
              </Td>
              <Td align="right">{peso(session.pricePerPlayer)}</Td>
              <Td>
                <Badge
                  tone={
                    session.status === "OPEN"
                      ? "green"
                      : session.status === "CANCELLED"
                        ? "red"
                        : "neutral"
                  }
                >
                  {session.status.replace(/_/g, " ").toLowerCase()}
                </Badge>
              </Td>
              <Td align="right">
                <span className="inline-flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void openCourtDisplay(session.id)}
                    title="Show courts on a second monitor"
                  >
                    <MonitorUp size={14} aria-hidden />
                    Display
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setManageId(session.id)}>
                    Manage stack
                  </Button>
                </span>
              </Td>
            </Row>
          ))}
        </Table>
      )}

      <CreateSessionModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={async () => {
          setCreateOpen(false);
          await reload();
        }}
      />

      <StackModal sessionId={manageId} onClose={() => setManageId(null)} onChanged={reload} />
    </div>
  );
}

function StackModal({
  sessionId,
  onClose,
  onChanged,
}: {
  sessionId: string | null;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [round, setRound] = useState(1);
  const { run, busy } = useMutate();

  const load = useCallback(async () => {
    if (!sessionId) return;
    const result = await api<{ session: SessionDetail }>(`/api/admin/open-play/${sessionId}`);
    setDetail(result.session);
  }, [sessionId]);

  useEffect(() => {
    setDetail(null);
    void load();
  }, [load]);

  // Older rounds' groups are emptied on re-stack; only the latest is on court.
  const latestRound = Math.max(0, ...(detail?.groups ?? []).map((g) => g.roundIndex));
  const courts = (detail?.groups ?? []).filter((g) => g.roundIndex === latestRound);

  const bench = (detail?.players ?? []).filter(
    (player) => !player.groupId && player.status !== "CANCELLED",
  );

  return (
    <Modal open={Boolean(sessionId)} onClose={onClose} title={detail?.title ?? "Open Play"} wide>
      {!detail ? (
        <Skeleton className="h-60 w-full" />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm">
              <span className="mb-1.5 block text-[13px] font-medium text-white/70">Round</span>
              <input
                type="number"
                min={1}
                max={50}
                className={`${selectClass} w-24`}
                value={round}
                onChange={(e) => setRound(Number(e.target.value))}
              />
            </label>
            <Button
              className="self-end"
              loading={busy}
              onClick={() =>
                run(
                  () =>
                    api(`/api/admin/open-play/${sessionId}/stack`, {
                      body: { roundIndex: round },
                    }),
                  {
                    success: "Stack generated.",
                    onDone: async () => {
                      await load();
                      await onChanged();
                    },
                  },
                )
              }
            >
              <Shuffle size={16} aria-hidden />
              Generate stack
            </Button>
            <Button
              className="self-end"
              variant="ghost"
              onClick={() => sessionId && void openCourtDisplay(sessionId)}
            >
              <MonitorUp size={16} aria-hidden />
              Open on 2nd monitor
            </Button>
            <p className="flex-1 text-xs text-white/35">
              The stacker balances group ratings and avoids repeating the same pairings across
              rounds. You can still move anyone by hand afterwards.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/[0.04] p-4">
            <label className="text-sm">
              <span className="mb-1.5 flex items-center gap-1.5 text-[13px] font-medium text-white/70">
                <Crown size={13} className="text-amber-300" aria-hidden />
                Stacking operator
              </span>
              <select
                className={`${selectClass} w-64`}
                value={detail.operatorUserId ?? ""}
                disabled={busy}
                onChange={(e) =>
                  run(
                    () =>
                      api(`/api/admin/open-play/${sessionId}/operator`, {
                        method: "PUT",
                        body: { userId: e.target.value || null },
                      }),
                    {
                      success: e.target.value ? "Operator assigned." : "Operator removed.",
                      onDone: load,
                    },
                  )
                }
              >
                <option value="">No operator (admin only)</option>
                {detail.players
                  .filter((p) => p.status === "REGISTERED" || p.status === "CHECKED_IN")
                  .map((p) => (
                    <option key={p.user.id} value={p.user.id}>
                      {p.user.fullName}
                    </option>
                  ))}
              </select>
            </label>
            <p className="flex-1 text-xs text-white/40">
              The operator runs rounds, moves players and records scores from the session page on
              their own phone. Every player in this session sees the courts and their own record live.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <AnimatePresence initial={false}>
              {courts.map((group, groupIndex) => (
                <motion.div
                  key={group.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: groupIndex * 0.08 }}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-white">
                      {group.court?.name ?? group.label}
                    </p>
                    {group.avgRating != null && (
                      <span className="text-xs text-white/35">avg {group.avgRating.toFixed(2)}</span>
                    )}
                  </div>
                  <ul className="mt-3 space-y-1.5">
                    {group.players.map((player) => (
                      <motion.li
                        key={player.id}
                        layout
                        className="flex items-center justify-between rounded-lg bg-white/[0.05] px-2.5 py-1.5 text-sm"
                      >
                        <span className="truncate text-white/85">{player.user.fullName}</span>
                        <span className="flex items-center gap-2">
                          <span className="text-xs tabular-nums text-white/35">
                            {player.skillRating?.toFixed(1) ?? "—"}
                          </span>
                          <select
                            className="rounded-md bg-ink px-1.5 py-1 text-xs text-white/70"
                            value={group.id}
                            onChange={(e) =>
                              run(
                                () =>
                                  api(`/api/admin/open-play/${sessionId}/stack`, {
                                    method: "PATCH",
                                    body: {
                                      playerId: player.id,
                                      groupId: e.target.value || null,
                                    },
                                  }),
                                { success: "Player moved.", onDone: load },
                              )
                            }
                            aria-label={`Move ${player.user.fullName}`}
                          >
                            {courts.map((g) => (
                              <option key={g.id} value={g.id}>
                                {g.court?.name ?? g.label}
                              </option>
                            ))}
                            <option value="">Bench</option>
                          </select>
                        </span>
                      </motion.li>
                    ))}
                  </ul>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <p className="text-[11px] uppercase tracking-[0.14em] text-white/35">
                Bench / unassigned ({bench.length})
              </p>
              {bench.length === 0 ? (
                <p className="mt-3 text-sm text-white/30">Everyone is on a court.</p>
              ) : (
                <ul className="mt-3 space-y-1.5 text-sm">
                  {bench.map((player) => (
                    <li
                      key={player.id}
                      className="flex items-center justify-between rounded-lg bg-white/[0.04] px-2.5 py-1.5"
                    >
                      <span className="text-white/80">{player.user.fullName}</span>
                      <Badge tone={player.status === "REGISTERED" ? "green" : "amber"}>
                        {player.status.replace(/_/g, " ").toLowerCase()}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <p className="text-[11px] uppercase tracking-[0.14em] text-white/35">
                Waitlist ({detail.waitlist.length})
              </p>
              {detail.waitlist.length === 0 ? (
                <p className="mt-3 text-sm text-white/30">Nobody waiting.</p>
              ) : (
                <ul className="mt-3 space-y-1.5 text-sm">
                  {detail.waitlist.map((entry) => (
                    <li
                      key={entry.id}
                      className="flex items-center justify-between rounded-lg bg-white/[0.04] px-2.5 py-1.5"
                    >
                      <span className="text-white/80">
                        #{entry.position} {entry.user.fullName}
                      </span>
                      <Badge tone={entry.status === "OFFERED" ? "amber" : "neutral"}>
                        {entry.status.toLowerCase()}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

function CreateSessionModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const { run, busy } = useMutate();
  const [form, setForm] = useState({
    title: "Friday Open Play",
    date: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date()),
    startMin: 19 * 60,
    endMin: 21 * 60,
    skillLevel: "INTERMEDIATE",
    pricePerPlayer: 25000,
    courtCount: 4,
    playersPerCourt: 4,
    minPlayers: 8,
    maxPlayers: 16,
    rotationMins: 15,
    status: "OPEN",
    notes: "",
  });

  return (
    <Modal open={open} onClose={onClose} title="New Open Play session">
      <div className="space-y-4">
        <Field label="Title">
          <input
            className={inputClass}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <label className="text-sm">
            <span className="mb-1.5 block text-[13px] font-medium text-white/70">Date</span>
            <input
              type="date"
              className={`${selectClass} w-full`}
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1.5 block text-[13px] font-medium text-white/70">Start</span>
            <select
              className={`${selectClass} w-full`}
              value={form.startMin}
              onChange={(e) => setForm({ ...form, startMin: Number(e.target.value) })}
            >
              {Array.from({ length: 36 }, (_, i) => 6 * 60 + i * 30).map((m) => (
                <option key={m} value={m}>
                  {minutesToLabel(m)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1.5 block text-[13px] font-medium text-white/70">End</span>
            <select
              className={`${selectClass} w-full`}
              value={form.endMin}
              onChange={(e) => setForm({ ...form, endMin: Number(e.target.value) })}
            >
              {Array.from({ length: 36 }, (_, i) => 6 * 60 + (i + 1) * 30).map((m) => (
                <option key={m} value={m}>
                  {minutesToLabel(m)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="mb-1.5 block text-[13px] font-medium text-white/70">Skill level</span>
            <select
              className={`${selectClass} w-full`}
              value={form.skillLevel}
              onChange={(e) => setForm({ ...form, skillLevel: e.target.value })}
            >
              {SKILLS.map((s) => (
                <option key={s} value={s}>
                  {s.toLowerCase()}
                </option>
              ))}
            </select>
          </label>
          <Field label="Price per player (₱)">
            <input
              type="number"
              min={0}
              step={10}
              className={inputClass}
              value={form.pricePerPlayer / 100}
              onChange={(e) =>
                setForm({ ...form, pricePerPlayer: Math.round(Number(e.target.value) * 100) })
              }
            />
          </Field>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <Field label="Courts">
            <input
              type="number"
              min={1}
              className={inputClass}
              value={form.courtCount}
              onChange={(e) => setForm({ ...form, courtCount: Number(e.target.value) })}
            />
          </Field>
          <Field label="Per court">
            <input
              type="number"
              min={2}
              max={8}
              className={inputClass}
              value={form.playersPerCourt}
              onChange={(e) => setForm({ ...form, playersPerCourt: Number(e.target.value) })}
            />
          </Field>
          <Field label="Min players">
            <input
              type="number"
              min={1}
              className={inputClass}
              value={form.minPlayers}
              onChange={(e) => setForm({ ...form, minPlayers: Number(e.target.value) })}
            />
          </Field>
          <Field label="Max players">
            <input
              type="number"
              min={1}
              className={inputClass}
              value={form.maxPlayers}
              onChange={(e) => setForm({ ...form, maxPlayers: Number(e.target.value) })}
            />
          </Field>
        </div>

        <Field label="Notes">
          <input
            className={inputClass}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </Field>

        <Button
          className="w-full"
          loading={busy}
          onClick={() =>
            run(() => api("/api/admin/open-play", { body: { ...form, notes: form.notes || null } }), {
              success: "Session created.",
              onDone: onCreated,
            })
          }
        >
          Create session
        </Button>
      </div>
    </Modal>
  );
}
