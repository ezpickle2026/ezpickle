"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Clock, Film, Radio, Video } from "lucide-react";
import { api, ApiError } from "@/lib/client";
import { useBrand } from "@/components/brand";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState, Skeleton } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { CamPlayer, type CamStreamType } from "./player";

type Court = { name: string; number: number };
type Replay = {
  id: string;
  title: string | null;
  startAt: string;
  endAt: string | null;
  thumbnailUrl: string | null;
  court: Court;
  match: { kind: "booking" | "open_play"; label: string } | null;
};
type LiveCam = { id: string; name: string; court: Court; online: boolean; until: string | null };
type Playing = {
  id: string;
  live: boolean;
  src: string;
  type: CamStreamType;
  poster: string | null;
  title: string;
  court: Court;
  startAt?: string;
  endAt?: string | null;
};

const tz = { timeZone: "Asia/Manila" } as const;
const fmtDay = (iso: string) =>
  new Intl.DateTimeFormat("en-PH", { ...tz, weekday: "short", day: "numeric", month: "short" }).format(new Date(iso));
const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat("en-PH", { ...tz, hour: "numeric", minute: "2-digit" }).format(new Date(iso));

export function PickleCamLibrary({ address }: { address: string }) {
  const toast = useToast();
  const [data, setData] = useState<{ replayDays: number; recordings: Replay[]; live: LiveCam[] } | null>(null);
  const [playing, setPlaying] = useState<Playing | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api("/api/cam/recordings"));
    } catch {
      toast.push("We couldn't load your Pickle Cam videos. Please refresh.", "error");
      setData({ replayDays: 30, recordings: [], live: [] });
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const openReplay = useCallback(
    async (id: string) => {
      setOpening(id);
      try {
        const { recording: r } = await api<{
          recording: { id: string; title: string | null; src: string; type: CamStreamType; poster: string | null; court: Court; startAt: string; endAt: string | null };
        }>(`/api/cam/recordings/${id}`);
        setPlaying({ ...r, live: false, title: r.title ?? r.court.name });
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch (error) {
        toast.push(error instanceof ApiError ? error.message : "Couldn't open that video.", "error");
      } finally {
        setOpening(null);
      }
    },
    [toast],
  );

  async function openLive(id: string) {
    setOpening(id);
    try {
      const { live } = await api<{ live: { id: string; name: string; src: string; type: CamStreamType; court: Court } }>(
        `/api/cam/live/${id}`,
      );
      setPlaying({ ...live, live: true, poster: null, title: `${live.court.name} · ${live.name}` });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      toast.push(error instanceof ApiError ? error.message : "Couldn't open the live feed.", "error");
    } finally {
      setOpening(null);
    }
  }

  // Deep link from the dashboard: /pickle-cam?r=<recording id>
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("r");
    if (id) void openReplay(id);
  }, [openReplay]);

  const byDay = useMemo(() => {
    const groups = new Map<string, Replay[]>();
    for (const r of data?.recordings ?? []) {
      const day = fmtDay(r.startAt);
      groups.set(day, [...(groups.get(day) ?? []), r]);
    }
    return [...groups.entries()];
  }, [data]);

  return (
    <div className="grid gap-8 lg:grid-cols-[260px_minmax(0,1fr)]">
      <BrandPanel address={address} />

      <div className="min-w-0">
        <header className="mb-6">
          <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-pickle-400">Pickle Cam</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">Your game videos</h1>
          <p className="mt-1.5 max-w-xl text-sm text-white/50">
            Replays from the courts you played on, during the time you played there.
            {data ? ` Videos stay here for ${data.replayDays} days.` : ""}
          </p>
        </header>

        {playing && (
          <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
            <CamPlayer
              src={playing.src}
              type={playing.type}
              poster={playing.poster}
              live={playing.live}
              caption={playing.court.name}
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold text-white">{playing.title}</p>
                {playing.startAt && (
                  <p className="text-sm text-white/45">
                    {fmtDay(playing.startAt)} · {fmtTime(playing.startAt)}
                    {playing.endAt ? ` – ${fmtTime(playing.endAt)}` : ""}
                  </p>
                )}
              </div>
              <Button size="sm" variant="ghost" onClick={() => setPlaying(null)}>
                Close player
              </Button>
            </div>
          </motion.section>
        )}

        {data === null ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="aspect-video w-full" />
            <Skeleton className="aspect-video w-full" />
          </div>
        ) : (
          <>
            {data.live.length > 0 && (
              <section className="mb-8">
                <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-white">
                  <Radio size={18} className="text-red-400" aria-hidden />
                  Live on your court
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {data.live.map((cam) => (
                    <Card key={cam.id} className="flex items-center gap-4">
                      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-red-500/15 text-red-300">
                        <Video size={20} aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-white">{cam.court.name}</p>
                        <p className="text-xs text-white/45">
                          {cam.name}
                          {cam.until ? ` · until ${fmtTime(cam.until)}` : ""}
                        </p>
                      </div>
                      <Button size="sm" loading={opening === cam.id} onClick={() => openLive(cam.id)}>
                        Watch live
                      </Button>
                    </Card>
                  ))}
                </div>
              </section>
            )}

            {byDay.length === 0 ? (
              <EmptyState
                title="No game videos yet"
                description="When you play on a court with a Pickle Cam, the recording of your slot shows up here after the game."
                action={
                  <Link href="/book">
                    <Button>Book a court</Button>
                  </Link>
                }
              />
            ) : (
              <div className="space-y-8">
                {byDay.map(([day, items]) => (
                  <section key={day}>
                    <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-white/40">{day}</h2>
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      {items.map((r) => (
                        <ReplayCard
                          key={r.id}
                          replay={r}
                          active={playing?.id === r.id}
                          loading={opening === r.id}
                          onOpen={() => openReplay(r.id)}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ReplayCard({
  replay,
  active,
  loading,
  onOpen,
}: {
  replay: Replay;
  active: boolean;
  loading: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={loading}
      className={cn(
        "group overflow-hidden rounded-2xl border bg-ink-card/70 text-left transition hover:border-pickle-500/50",
        active ? "border-pickle-500/70" : "border-white/10",
      )}
    >
      <div className="relative aspect-video bg-white/5">
        {replay.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={replay.thumbnailUrl} alt="" className="size-full object-cover" />
        ) : (
          <span className="grid size-full place-items-center text-white/25">
            <Film size={30} aria-hidden />
          </span>
        )}
        <span className="absolute inset-0 grid place-items-center bg-black/0 transition group-hover:bg-black/30">
          <span className="rounded-full bg-pickle-500 px-3 py-1 text-xs font-bold text-ink opacity-0 transition group-hover:opacity-100">
            {loading ? "Opening…" : "Play"}
          </span>
        </span>
      </div>
      <div className="p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate font-semibold text-white">{replay.title ?? replay.court.name}</p>
          {replay.match && (
            <Badge tone={replay.match.kind === "booking" ? "green" : "amber"}>
              {replay.match.kind === "booking" ? "Booking" : "Open Play"}
            </Badge>
          )}
        </div>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-white/45">
          <Clock size={12} aria-hidden />
          {fmtTime(replay.startAt)}
          {replay.endAt ? ` – ${fmtTime(replay.endAt)}` : ""} · {replay.court.name}
        </p>
        {replay.match && <p className="mt-1 truncate text-xs text-white/35">{replay.match.label}</p>}
      </div>
    </button>
  );
}

/** Business logo and name on the side of the Pickle Cam page. */
function BrandPanel({ address }: { address: string }) {
  const { businessName } = useBrand();
  return (
    <aside className="lg:sticky lg:top-24 lg:self-start">
      <Card className="flex items-center gap-4 lg:flex-col lg:items-start lg:gap-5 lg:p-6">
        <Logo className="[&_img]:h-14 [&_img]:max-w-[200px] [&_svg]:size-12" showWordmark={false} />
        <div className="min-w-0">
          <p className="text-xl font-extrabold tracking-tight text-white">{businessName || "EzPickle"}</p>
          <p className="mt-0.5 text-xs font-semibold uppercase tracking-[0.18em] text-pickle-400">Pickle Cam</p>
          {address && <p className="mt-3 hidden text-sm text-white/45 lg:block">{address}</p>}
        </div>
        <p className="hidden text-sm leading-relaxed text-white/50 lg:block">
          Courts with a Pickle Cam record every game. Only the players on that court, at that time, can watch the video.
        </p>
      </Card>
    </aside>
  );
}
