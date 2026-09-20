"use client";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/lib/client";
import { useRealtime } from "@/hooks/use-realtime";
import {
  Button,
  Card,
  PageHeader,
  Skeleton,
  minutesToLabel,
  useResource,
} from "@/components/admin/ui";
import { cn } from "@/lib/utils";

type Slot = { startMin: number; endMin: number; state: string; price: number };
type CourtRow = { courtId: string; courtName: string; courtNumber: number; slots: Slot[] };
type Availability = {
  date: string;
  intervalMins: number;
  openingMin: number;
  closingMin: number;
  courts: CourtRow[];
};
type Booking = {
  id: string;
  reference: string;
  startAt: string;
  endAt: string;
  status: string;
  court: { name: string };
  customer: { fullName: string };
};

const VIEWS = ["Day", "Week", "Month"] as const;
type View = (typeof VIEWS)[number];

const STATE_STYLE: Record<string, string> = {
  AVAILABLE: "bg-pickle-500/12 text-pickle-300/80",
  BOOKED: "bg-red-500/25 text-red-200",
  HELD: "bg-amber-400/25 text-amber-200",
  BLOCKED: "bg-white/10 text-white/35",
  CLOSED: "bg-white/5 text-white/20",
  PAST: "bg-white/[0.03] text-white/20",
};

function manilaToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
}

function shiftDate(dateISO: string, days: number) {
  const d = new Date(`${dateISO}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function startOfWeek(dateISO: string) {
  const d = new Date(`${dateISO}T12:00:00Z`);
  return shiftDate(dateISO, -d.getUTCDay());
}

export default function AdminCalendarPage() {
  const [view, setView] = useState<View>("Day");
  const [date, setDate] = useState(manilaToday());

  return (
    <div>
      <PageHeader
        title="Calendar"
        description="Visual court schedule. Green is open, red is booked, amber is held pending payment."
        actions={
          <div className="flex gap-1.5">
            {VIEWS.map((item) => (
              <button
                key={item}
                onClick={() => setView(item)}
                aria-pressed={view === item}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-sm font-medium transition",
                  view === item ? "bg-pickle-500 text-ink" : "bg-white/5 text-white/55 hover:bg-white/10",
                )}
              >
                {item}
              </button>
            ))}
          </div>
        }
      />

      <div className="mb-5 flex items-center gap-3">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setDate(shiftDate(date, view === "Month" ? -30 : view === "Week" ? -7 : -1))}
          aria-label="Previous"
        >
          <ChevronLeft size={16} />
        </Button>
        <input
          type="date"
          className="rounded-xl border border-white/12 bg-ink-card px-3 py-2 text-sm text-white focus:border-pickle-500/60 focus:outline-none"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setDate(shiftDate(date, view === "Month" ? 30 : view === "Week" ? 7 : 1))}
          aria-label="Next"
        >
          <ChevronRight size={16} />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setDate(manilaToday())}>
          Today
        </Button>
      </div>

      {view === "Day" && <DayGrid date={date} />}
      {view === "Week" && <RangeList from={startOfWeek(date)} days={7} />}
      {view === "Month" && <RangeList from={`${date.slice(0, 7)}-01`} days={31} />}
    </div>
  );
}

function DayGrid({ date }: { date: string }) {
  const { data, loading, reload } = useResource<Availability>(`/api/availability?date=${date}`);

  // A booking made anywhere — front desk or website — repaints the grid.
  useRealtime("availability", () => void reload());

  if (loading && !data) return <Skeleton className="h-80 w-full" />;
  if (!data) return null;

  const times = data.courts[0]?.slots.map((s) => s.startMin) ?? [];

  return (
    <div className="ezp-scroll overflow-x-auto rounded-2xl border border-white/10 bg-ink-card/60 p-3">
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `90px repeat(${times.length}, minmax(52px, 1fr))`, minWidth: 900 }}
      >
        <div />
        {times.map((min) => (
          <div key={min} className="pb-1 text-center text-[10px] font-medium text-white/35">
            {minutesToLabel(min)}
          </div>
        ))}

        {data.courts.map((court) => (
          <div key={court.courtId} className="contents">
            <div className="flex items-center truncate pr-2 text-xs font-semibold text-white/70">
              {court.courtName}
            </div>
            {court.slots.map((slot) => (
              <div
                key={`${court.courtId}-${slot.startMin}`}
                title={`${court.courtName} · ${minutesToLabel(slot.startMin)} — ${slot.state.toLowerCase()}`}
                className={cn(
                  "h-9 rounded-md text-[10px] font-semibold uppercase leading-9 text-center transition",
                  STATE_STYLE[slot.state] ?? STATE_STYLE.CLOSED,
                )}
              >
                {slot.state === "BOOKED" ? "×" : ""}
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-4 px-1 text-xs text-white/45">
        {[
          ["Available", "bg-pickle-500"],
          ["Booked", "bg-red-500"],
          ["Held", "bg-amber-400"],
          ["Blocked", "bg-white/30"],
        ].map(([label, colour]) => (
          <span key={label} className="flex items-center gap-2">
            <span className={cn("size-2.5 rounded-full", colour)} aria-hidden />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function RangeList({ from, days }: { from: string; days: number }) {
  const to = shiftDate(from, days - 1);
  const { data, loading } = useResource<{ bookings: Booking[] }>(
    `/api/admin/bookings?from=${from}&to=${to}&perPage=100`,
  );

  const grouped = useMemo(() => {
    const map = new Map<string, Booking[]>();
    for (const booking of data?.bookings ?? []) {
      const key = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(
        new Date(booking.startAt),
      );
      map.set(key, [...(map.get(key) ?? []), booking]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.startAt.localeCompare(b.startAt));
    }
    return map;
  }, [data]);

  if (loading && !data) return <Skeleton className="h-80 w-full" />;

  const dates = Array.from({ length: days }, (_, i) => shiftDate(from, i)).filter((d) =>
    d.startsWith(from.slice(0, 7)) || days === 7,
  );

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {dates.map((day) => {
        const bookings = grouped.get(day) ?? [];
        return (
          <Card key={day} className="p-4">
            <p className="text-sm font-semibold text-white">
              {new Intl.DateTimeFormat("en-PH", {
                timeZone: "Asia/Manila",
                weekday: "short",
                day: "numeric",
                month: "short",
              }).format(new Date(`${day}T12:00:00Z`))}
            </p>
            {bookings.length === 0 ? (
              <p className="mt-3 text-xs text-white/25">No bookings</p>
            ) : (
              <ul className="mt-3 space-y-1.5">
                {bookings.slice(0, 6).map((booking) => (
                  <li key={booking.id} className="rounded-lg bg-white/[0.04] px-2.5 py-1.5 text-xs">
                    <span className="block font-medium text-white/80">
                      {new Intl.DateTimeFormat("en-PH", {
                        timeZone: "Asia/Manila",
                        hour: "numeric",
                        minute: "2-digit",
                      }).format(new Date(booking.startAt))}{" "}
                      · {booking.court.name}
                    </span>
                    <span className="block truncate text-white/40">{booking.customer.fullName}</span>
                  </li>
                ))}
                {bookings.length > 6 && (
                  <li className="px-2.5 text-xs text-white/35">+{bookings.length - 6} more</li>
                )}
              </ul>
            )}
          </Card>
        );
      })}
    </div>
  );
}
