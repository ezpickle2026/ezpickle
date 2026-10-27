"use client";
import { useEffect, useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
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
  Pagination,
  Row,
  Skeleton,
  Table,
  confirmAction,
  fmtDate,
  fmtTime,
  inputClass,
  minutesToLabel,
  selectClass,
  useMutate,
  useResource,
} from "@/components/admin/ui";
import { peso } from "@/lib/utils";

type Booking = {
  id: string;
  reference: string;
  startAt: string;
  endAt: string;
  durationMins: number;
  subtotal: number;
  discount: number;
  total: number;
  status: string;
  source: string;
  notes: string | null;
  court: { name: string; number: number };
  customer: { id: string; fullName: string; email: string; mobile: string | null };
  payments: { status: string; amount: number; method: string | null; referenceNumber: string | null }[];
};

type ListResponse = { bookings: Booking[]; total: number; page: number; pages: number };
type Court = { id: string; name: string; number: number; hourlyPrice: number };

const STATUSES = [
  "PENDING",
  "PAYMENT_PENDING",
  "CONFIRMED",
  "CHECKED_IN",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
  "REFUNDED",
  "EXPIRED",
];

const TONE: Record<string, "green" | "amber" | "red" | "neutral"> = {
  CONFIRMED: "green",
  CHECKED_IN: "green",
  COMPLETED: "neutral",
  PAYMENT_PENDING: "amber",
  PENDING: "amber",
  CANCELLED: "red",
  NO_SHOW: "red",
  REFUNDED: "red",
  EXPIRED: "neutral",
};

export default function AdminBookingsPage() {
  const [filters, setFilters] = useState({ q: "", status: "", courtId: "", from: "", to: "" });
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [active, setActive] = useState<Booking | null>(null);
  const [courts, setCourts] = useState<Court[]>([]);

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), perPage: "25" });
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
    return `/api/admin/bookings?${params}`;
  }, [filters, page]);

  const { data, loading, reload } = useResource<ListResponse>(query);
  const { run, busy } = useMutate();

  useEffect(() => {
    api<{ courts: Court[] }>("/api/admin/courts")
      .then((r) => setCourts(r.courts))
      .catch(() => setCourts([]));
  }, []);

  function setFilter(key: keyof typeof filters, value: string) {
    setPage(1);
    setFilters((f) => ({ ...f, [key]: value }));
  }

  async function setStatus(booking: Booking, status: string) {
    await run(() => api(`/api/admin/bookings/${booking.id}`, { method: "PATCH", body: { status } }), {
      success: `Booking marked ${status.replace(/_/g, " ").toLowerCase()}.`,
      onDone: async () => {
        setActive(null);
        await reload();
      },
    });
  }

  async function refund(booking: Booking) {
    if (!confirmAction(`Refund ${peso(booking.total)} for ${booking.reference}?`)) return;
    await run(() => api(`/api/admin/bookings/${booking.id}/refund`, { body: { reason: "requested_by_customer" } }), {
      success: "Refund submitted to PayMongo.",
      onDone: async () => {
        setActive(null);
        await reload();
      },
    });
  }

  return (
    <div>
      <PageHeader
        title="Bookings"
        description="Search, filter and manage every reservation."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus size={16} aria-hidden />
            New booking
          </Button>
        }
      />

      <Card className="mb-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
            <Field label="Search">
              <div className="relative">
                <Search
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/30"
                  aria-hidden
                />
                <input
                  className={`${inputClass} pl-9`}
                  placeholder="Reference, name or email"
                  value={filters.q}
                  onChange={(e) => setFilter("q", e.target.value)}
                />
              </div>
            </Field>
          </div>
          <label className="text-sm">
            <span className="mb-1.5 block text-[13px] font-medium text-white/70">Status</span>
            <select
              className={selectClass}
              value={filters.status}
              onChange={(e) => setFilter("status", e.target.value)}
            >
              <option value="">All</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ").toLowerCase()}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1.5 block text-[13px] font-medium text-white/70">Court</span>
            <select
              className={selectClass}
              value={filters.courtId}
              onChange={(e) => setFilter("courtId", e.target.value)}
            >
              <option value="">All</option>
              {courts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1.5 block text-[13px] font-medium text-white/70">From</span>
            <input
              type="date"
              className={selectClass}
              value={filters.from}
              onChange={(e) => setFilter("from", e.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1.5 block text-[13px] font-medium text-white/70">To</span>
            <input
              type="date"
              className={selectClass}
              value={filters.to}
              onChange={(e) => setFilter("to", e.target.value)}
            />
          </label>
        </div>
      </Card>

      {loading && !data ? (
        <Skeleton className="h-72 w-full" />
      ) : !data || data.bookings.length === 0 ? (
        <EmptyState
          title="No bookings match those filters"
          description="Try widening the date range or clearing the search."
        />
      ) : (
        <>
          <Table head={["Reference", "Customer", "Court", "When", "Total", "Payment", "Status", ""]} minWidth={980}>
            {data.bookings.map((booking) => {
              const paid = booking.payments.some((p) => p.status === "PAID");
              return (
                <Row key={booking.id}>
                  <Td className="font-mono text-xs">{booking.reference}</Td>
                  <Td>
                    <span className="block text-white/85">{booking.customer.fullName}</span>
                    <span className="block text-xs text-white/35">{booking.customer.email}</span>
                  </Td>
                  <Td>{booking.court.name}</Td>
                  <Td>
                    {fmtDate(booking.startAt, { weekday: "short" })} · {fmtTime(booking.startAt)} –{" "}
                    {fmtTime(booking.endAt)}
                  </Td>
                  <Td align="right">{peso(booking.total)}</Td>
                  <Td>
                    <Badge tone={paid ? "green" : "amber"}>{paid ? "paid" : "unpaid"}</Badge>
                  </Td>
                  <Td>
                    <Badge tone={TONE[booking.status] ?? "neutral"}>
                      {booking.status.replace(/_/g, " ").toLowerCase()}
                    </Badge>
                  </Td>
                  <Td align="right">
                    <Button size="sm" variant="ghost" onClick={() => setActive(booking)}>
                      Manage
                    </Button>
                  </Td>
                </Row>
              );
            })}
          </Table>
          <Pagination page={data.page} pages={data.pages} onPage={setPage} />
        </>
      )}

      <Modal open={Boolean(active)} onClose={() => setActive(null)} title={active?.reference ?? ""} wide>
        {active && (
          <div className="space-y-5">
            <dl className="grid grid-cols-2 gap-4 text-sm">
              {[
                ["Customer", active.customer.fullName],
                ["Contact", active.customer.mobile ?? active.customer.email],
                ["Court", active.court.name],
                ["Date", fmtDate(active.startAt, { weekday: "long" })],
                ["Time", `${fmtTime(active.startAt)} – ${fmtTime(active.endAt)}`],
                ["Duration", `${active.durationMins / 60}h`],
                ["Subtotal", peso(active.subtotal)],
                ["Discount", peso(active.discount)],
                ["Total", peso(active.total)],
                ["Source", active.source.replace(/_/g, " ").toLowerCase()],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[11px] uppercase tracking-[0.14em] text-white/35">{label}</dt>
                  <dd className="mt-0.5 text-white/85">{value}</dd>
                </div>
              ))}
            </dl>

            {active.notes && (
              <p className="rounded-xl bg-white/[0.04] px-3 py-2 text-sm text-white/60">
                {active.notes}
              </p>
            )}

            <div>
              <p className="mb-2 text-[11px] uppercase tracking-[0.14em] text-white/35">Payments</p>
              {active.payments.length === 0 ? (
                <p className="text-sm text-white/40">No payment records.</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {active.payments.map((payment, index) => (
                    <li
                      key={index}
                      className="flex items-center justify-between rounded-xl bg-white/[0.04] px-3 py-2"
                    >
                      <span className="text-white/70">
                        {payment.method ?? "—"} · {payment.referenceNumber ?? "—"}
                      </span>
                      <span className="flex items-center gap-3">
                        <Badge tone={payment.status === "PAID" ? "green" : "amber"}>
                          {payment.status.toLowerCase()}
                        </Badge>
                        <span className="font-semibold text-white">{peso(payment.amount)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <RescheduleForm booking={active} courts={courts} onDone={async () => { setActive(null); await reload(); }} />

            <div className="flex flex-wrap gap-2 border-t border-white/10 pt-4">
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => setStatus(active, "CHECKED_IN")}>
                Check in
              </Button>
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => setStatus(active, "COMPLETED")}>
                Complete
              </Button>
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => setStatus(active, "NO_SHOW")}>
                No show
              </Button>
              <Button
                size="sm"
                variant="danger"
                disabled={busy}
                onClick={() => {
                  if (confirmAction(`Cancel ${active.reference}? This frees the slot immediately.`)) {
                    void setStatus(active, "CANCELLED");
                  }
                }}
              >
                Cancel booking
              </Button>
              {active.payments.some((p) => p.status === "PAID") && (
                <Button size="sm" variant="danger" disabled={busy} onClick={() => refund(active)}>
                  Refund
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>

      <CreateBookingModal
        open={createOpen}
        courts={courts}
        onClose={() => setCreateOpen(false)}
        onCreated={async () => {
          setCreateOpen(false);
          await reload();
        }}
      />
    </div>
  );
}

function RescheduleForm({
  booking,
  courts,
  onDone,
}: {
  booking: Booking;
  courts: Court[];
  onDone: () => Promise<void>;
}) {
  const { run, busy } = useMutate();
  const start = new Date(booking.startAt);
  const manilaDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(start);
  const manilaMinutes =
    Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Manila", hour: "2-digit", hour12: false }).format(start)) *
      60 +
    Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Manila", minute: "2-digit" }).format(start));

  const [form, setForm] = useState({
    courtId: courts.find((c) => c.name === booking.court.name)?.id ?? "",
    date: manilaDate,
    startMin: manilaMinutes,
    durationMins: booking.durationMins,
  });

  return (
    <div className="border-t border-white/10 pt-4">
      <p className="mb-3 text-[11px] uppercase tracking-[0.14em] text-white/35">Reschedule</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1.5 block text-[13px] font-medium text-white/70">Court</span>
          <select
            className={selectClass}
            value={form.courtId}
            onChange={(e) => setForm({ ...form, courtId: e.target.value })}
          >
            <option value="">Select…</option>
            {courts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1.5 block text-[13px] font-medium text-white/70">Date</span>
          <input
            type="date"
            className={selectClass}
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1.5 block text-[13px] font-medium text-white/70">Start</span>
          <select
            className={selectClass}
            value={form.startMin}
            onChange={(e) => setForm({ ...form, startMin: Number(e.target.value) })}
          >
            {Array.from({ length: 36 }, (_, i) => 6 * 60 + i * 30).map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutesToLabel(minutes)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1.5 block text-[13px] font-medium text-white/70">Duration</span>
          <select
            className={selectClass}
            value={form.durationMins}
            onChange={(e) => setForm({ ...form, durationMins: Number(e.target.value) })}
          >
            {[60, 90, 120, 150, 180].map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes / 60}h
              </option>
            ))}
          </select>
        </label>
        <Button
          size="sm"
          variant="secondary"
          loading={busy}
          disabled={!form.courtId}
          onClick={() =>
            run(
              () =>
                api(`/api/admin/bookings/${booking.id}/reschedule`, {
                  method: "POST",
                  body: form,
                }),
              { success: "Booking rescheduled.", onDone },
            )
          }
        >
          Move booking
        </Button>
      </div>
      <p className="mt-2 text-xs text-white/35">
        The move runs through the same locking path as a customer booking, so a clash is rejected
        rather than silently double-booked.
      </p>
    </div>
  );
}

function CreateBookingModal({
  open,
  courts,
  onClose,
  onCreated,
}: {
  open: boolean;
  courts: Court[];
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const { run, busy } = useMutate();
  const [form, setForm] = useState({
    courtId: "",
    date: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date()),
    startMin: 18 * 60,
    durationMins: 60,
    customerName: "",
    customerEmail: "",
    customerMobile: "",
    notes: "",
    markPaid: true,
    paymentMethod: "cash",
  });

  return (
    <Modal open={open} onClose={onClose} title="New walk-in booking">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="mb-1.5 block text-[13px] font-medium text-white/70">Court</span>
            <select
              className={`${selectClass} w-full`}
              value={form.courtId}
              onChange={(e) => setForm({ ...form, courtId: e.target.value })}
            >
              <option value="">Select…</option>
              {courts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
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
              {Array.from({ length: 36 }, (_, i) => 6 * 60 + i * 30).map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutesToLabel(minutes)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1.5 block text-[13px] font-medium text-white/70">Duration</span>
            <select
              className={`${selectClass} w-full`}
              value={form.durationMins}
              onChange={(e) => setForm({ ...form, durationMins: Number(e.target.value) })}
            >
              {[60, 90, 120, 150, 180].map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes / 60}h
                </option>
              ))}
            </select>
          </label>
        </div>

        <Field label="Customer name">
          <input
            className={inputClass}
            value={form.customerName}
            onChange={(e) => setForm({ ...form, customerName: e.target.value })}
          />
        </Field>
        <Field label="Customer email" hint="Used to find or create their account.">
          <input
            className={inputClass}
            type="email"
            value={form.customerEmail}
            onChange={(e) => setForm({ ...form, customerEmail: e.target.value })}
          />
        </Field>
        <Field label="Mobile">
          <input
            className={inputClass}
            value={form.customerMobile}
            onChange={(e) => setForm({ ...form, customerMobile: e.target.value })}
          />
        </Field>
        <Field label="Notes">
          <input
            className={inputClass}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </Field>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-white/70">
            <input
              type="checkbox"
              className="size-4 accent-pickle-500"
              checked={form.markPaid}
              onChange={(e) => setForm({ ...form, markPaid: e.target.checked })}
            />
            Payment collected
          </label>
          {form.markPaid && (
            <select
              className={selectClass}
              value={form.paymentMethod}
              onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
            >
              <option value="cash">Cash</option>
              <option value="gcash">GCash</option>
              <option value="maya">Maya</option>
              <option value="card">Card</option>
              <option value="bank_transfer">Bank transfer</option>
            </select>
          )}
        </div>

        <Button
          className="w-full"
          loading={busy}
          disabled={!form.courtId || !form.customerEmail || !form.customerName}
          onClick={() =>
            run(() => api("/api/admin/bookings", { body: { ...form, notes: form.notes || null } }), {
              success: "Booking created.",
              onDone: onCreated,
            })
          }
        >
          Create booking
        </Button>
      </div>
    </Modal>
  );
}
