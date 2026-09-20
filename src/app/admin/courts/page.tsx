"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { api } from "@/lib/client";
import {
  Badge,
  Button,
  Card,
  Cell as Td,
  Field,
  Modal,
  PageHeader,
  Row,
  Skeleton,
  Table,
  confirmAction,
  inputClass,
  minutesToLabel,
  selectClass,
  useMutate,
  useResource,
} from "@/components/admin/ui";
import { peso } from "@/lib/utils";

type Court = {
  id: string;
  name: string;
  number: number;
  description: string | null;
  indoor: boolean;
  surface: string;
  status: string;
  hourlyPrice: number;
  amenities: string[];
  active: boolean;
  bookable: boolean;
};

type PricingRule = {
  id: string;
  name: string;
  scope: string;
  courtId: string | null;
  daysOfWeek: number[];
  startMin: number;
  endMin: number;
  pricePerHour: number;
  priority: number;
  active: boolean;
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SURFACES = ["ACRYLIC", "CONCRETE", "CUSHIONED", "WOOD", "SYNTHETIC"];
const STATUSES = ["AVAILABLE", "MAINTENANCE", "CLOSED"];

const blankCourt = {
  name: "",
  number: 1,
  description: "",
  indoor: true,
  surface: "ACRYLIC",
  status: "AVAILABLE",
  hourlyPrice: 60000,
  amenities: [] as string[],
  active: true,
  bookable: true,
};

export default function AdminCourtsPage() {
  const courts = useResource<{ courts: Court[] }>("/api/admin/courts");
  const rules = useResource<{ rules: PricingRule[] }>("/api/admin/pricing-rules");
  const { run, busy } = useMutate();

  const [editing, setEditing] = useState<(typeof blankCourt & { id?: string }) | null>(null);
  const [blocking, setBlocking] = useState<Court | null>(null);
  const [ruleOpen, setRuleOpen] = useState(false);

  async function saveCourt() {
    if (!editing) return;
    const { id, ...payload } = editing;
    await run(
      () =>
        id
          ? api(`/api/admin/courts/${id}`, { method: "PATCH", body: payload })
          : api("/api/admin/courts", { body: payload }),
      {
        success: id ? "Court updated." : "Court created.",
        onDone: async () => {
          setEditing(null);
          await courts.reload();
        },
      },
    );
  }

  async function deactivate(court: Court) {
    if (!confirmAction(`Deactivate ${court.name}? Future bookings must be handled first.`)) return;
    await run(() => api(`/api/admin/courts/${court.id}`, { method: "DELETE" }), {
      success: "Court deactivated.",
      onDone: courts.reload,
    });
  }

  return (
    <div>
      <PageHeader
        title="Courts"
        description="Court setup, availability and the pricing rules that drive every quote."
        actions={
          <Button onClick={() => setEditing({ ...blankCourt })}>
            <Plus size={16} aria-hidden />
            Add court
          </Button>
        }
      />

      {courts.loading && !courts.data ? (
        <Skeleton className="h-60 w-full" />
      ) : (
        <Table head={["#", "Court", "Type", "Surface", "Base rate", "Status", ""]} minWidth={860}>
          {(courts.data?.courts ?? []).map((court) => (
            <Row key={court.id}>
              <Td className="tabular-nums">{court.number}</Td>
              <Td>
                <span className="block font-medium text-white/90">{court.name}</span>
                {court.description && (
                  <span className="block text-xs text-white/35">{court.description}</span>
                )}
              </Td>
              <Td>{court.indoor ? "Indoor" : "Outdoor"}</Td>
              <Td className="capitalize">{court.surface.toLowerCase()}</Td>
              <Td align="right">{peso(court.hourlyPrice)}/h</Td>
              <Td>
                <Badge
                  tone={
                    !court.active ? "neutral" : court.status === "AVAILABLE" ? "green" : "amber"
                  }
                >
                  {!court.active ? "inactive" : court.status.toLowerCase()}
                </Badge>
              </Td>
              <Td align="right">
                <div className="flex justify-end gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setEditing({
                        id: court.id,
                        name: court.name,
                        number: court.number,
                        description: court.description ?? "",
                        indoor: court.indoor,
                        surface: court.surface,
                        status: court.status,
                        hourlyPrice: court.hourlyPrice,
                        amenities: court.amenities,
                        active: court.active,
                        bookable: court.bookable,
                      })
                    }
                  >
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setBlocking(court)}>
                    Block
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => deactivate(court)}>
                    Remove
                  </Button>
                </div>
              </Td>
            </Row>
          ))}
        </Table>
      )}

      <section className="mt-10">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Pricing rules</h2>
            <p className="mt-1 text-sm text-white/45">
              Highest priority match wins. A booking that straddles two rules is billed per interval,
              not by its start time.
            </p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => setRuleOpen(true)}>
            <Plus size={15} aria-hidden />
            Add rule
          </Button>
        </div>

        {rules.loading && !rules.data ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <Table head={["Rule", "Scope", "Days", "Window", "Rate", "Priority", ""]} minWidth={860}>
            {(rules.data?.rules ?? []).map((rule) => (
              <Row key={rule.id}>
                <Td className="font-medium text-white/90">{rule.name}</Td>
                <Td className="capitalize">{rule.scope.replace(/_/g, " ").toLowerCase()}</Td>
                <Td>
                  {rule.daysOfWeek.length === 0
                    ? "Every day"
                    : rule.daysOfWeek.map((d) => DAY_NAMES[d]).join(", ")}
                </Td>
                <Td>
                  {minutesToLabel(rule.startMin)} – {minutesToLabel(rule.endMin)}
                </Td>
                <Td align="right">{peso(rule.pricePerHour)}/h</Td>
                <Td align="right" className="tabular-nums">
                  {rule.priority}
                </Td>
                <Td align="right">
                  <div className="flex justify-end gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () =>
                            api("/api/admin/pricing-rules", {
                              method: "PATCH",
                              body: { id: rule.id, active: !rule.active },
                            }),
                          { success: "Rule updated.", onDone: rules.reload },
                        )
                      }
                    >
                      {rule.active ? "Disable" : "Enable"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => {
                        if (!confirmAction(`Delete pricing rule "${rule.name}"?`)) return;
                        void run(
                          () =>
                            api(`/api/admin/pricing-rules?id=${rule.id}`, { method: "DELETE" }),
                          { success: "Rule deleted.", onDone: rules.reload },
                        );
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </Td>
              </Row>
            ))}
          </Table>
        )}
      </section>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.id ? "Edit court" : "Add court"}
      >
        {editing && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Name">
                <input
                  className={inputClass}
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </Field>
              <Field label="Court number">
                <input
                  type="number"
                  min={1}
                  className={inputClass}
                  value={editing.number}
                  onChange={(e) => setEditing({ ...editing, number: Number(e.target.value) })}
                />
              </Field>
            </div>

            <Field label="Description">
              <input
                className={inputClass}
                value={editing.description}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">
                <span className="mb-1.5 block text-[13px] font-medium text-white/70">Surface</span>
                <select
                  className={`${selectClass} w-full`}
                  value={editing.surface}
                  onChange={(e) => setEditing({ ...editing, surface: e.target.value })}
                >
                  {SURFACES.map((s) => (
                    <option key={s} value={s}>
                      {s.toLowerCase()}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1.5 block text-[13px] font-medium text-white/70">Status</span>
                <select
                  className={`${selectClass} w-full`}
                  value={editing.status}
                  onChange={(e) => setEditing({ ...editing, status: e.target.value })}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s.toLowerCase()}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <Field label="Base hourly rate (₱)" hint="Fallback when no pricing rule matches.">
              <input
                type="number"
                min={0}
                step={50}
                className={inputClass}
                value={editing.hourlyPrice / 100}
                onChange={(e) =>
                  setEditing({ ...editing, hourlyPrice: Math.round(Number(e.target.value) * 100) })
                }
              />
            </Field>

            <Field label="Amenities" hint="Comma separated, e.g. Lights, Seating, Water station">
              <input
                className={inputClass}
                value={editing.amenities.join(", ")}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    amenities: e.target.value
                      .split(",")
                      .map((a) => a.trim())
                      .filter(Boolean),
                  })
                }
              />
            </Field>

            <div className="flex gap-5 text-sm text-white/70">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="size-4 accent-pickle-500"
                  checked={editing.indoor}
                  onChange={(e) => setEditing({ ...editing, indoor: e.target.checked })}
                />
                Indoor
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="size-4 accent-pickle-500"
                  checked={editing.active}
                  onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
                />
                Active
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="size-4 accent-pickle-500"
                  checked={editing.bookable}
                  onChange={(e) => setEditing({ ...editing, bookable: e.target.checked })}
                />
                Bookable online
              </label>
            </div>

            <Button className="w-full" loading={busy} onClick={saveCourt}>
              {editing.id ? "Save changes" : "Create court"}
            </Button>
          </div>
        )}
      </Modal>

      <BlockModal court={blocking} onClose={() => setBlocking(null)} />
      <RuleModal
        open={ruleOpen}
        courts={courts.data?.courts ?? []}
        onClose={() => setRuleOpen(false)}
        onCreated={async () => {
          setRuleOpen(false);
          await rules.reload();
        }}
      />
    </div>
  );
}

function BlockModal({ court, onClose }: { court: Court | null; onClose: () => void }) {
  const { run, busy } = useMutate();
  const [form, setForm] = useState({
    date: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date()),
    startMin: 9 * 60,
    endMin: 12 * 60,
    reason: "MAINTENANCE",
    note: "",
  });

  return (
    <Modal open={Boolean(court)} onClose={onClose} title={`Block ${court?.name ?? ""}`}>
      <div className="space-y-4">
        <Field label="Date">
          <input
            type="date"
            className={inputClass}
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="mb-1.5 block text-[13px] font-medium text-white/70">From</span>
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
            <span className="mb-1.5 block text-[13px] font-medium text-white/70">To</span>
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
        <label className="block text-sm">
          <span className="mb-1.5 block text-[13px] font-medium text-white/70">Reason</span>
          <select
            className={`${selectClass} w-full`}
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
          >
            {["MAINTENANCE", "PRIVATE_EVENT", "OPEN_PLAY", "CLOSED", "OTHER"].map((r) => (
              <option key={r} value={r}>
                {r.replace(/_/g, " ").toLowerCase()}
              </option>
            ))}
          </select>
        </label>
        <Field label="Note">
          <input
            className={inputClass}
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
        </Field>
        <p className="text-xs text-white/35">
          If a paid booking already occupies that window the block is refused — cancel the booking
          first so the customer is handled properly.
        </p>
        <Button
          className="w-full"
          loading={busy}
          onClick={() =>
            run(
              () =>
                api("/api/admin/court-blocks", {
                  body: { ...form, courtId: court!.id, note: form.note || null },
                }),
              { success: "Court blocked.", onDone: async () => onClose() },
            )
          }
        >
          Block court
        </Button>
      </div>
    </Modal>
  );
}

function RuleModal({
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
    name: "",
    scope: "COURT_HOURLY",
    courtId: "",
    daysOfWeek: [] as number[],
    startMin: 6 * 60,
    endMin: 17 * 60,
    pricePerHour: 40000,
    priority: 10,
    active: true,
  });

  function toggleDay(day: number) {
    setForm((f) => ({
      ...f,
      daysOfWeek: f.daysOfWeek.includes(day)
        ? f.daysOfWeek.filter((d) => d !== day)
        : [...f.daysOfWeek, day].sort(),
    }));
  }

  return (
    <Modal open={open} onClose={onClose} title="Add pricing rule">
      <div className="space-y-4">
        <Field label="Name" hint="e.g. Peak evenings, Weekend rate">
          <input
            className={inputClass}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>

        <label className="block text-sm">
          <span className="mb-1.5 block text-[13px] font-medium text-white/70">
            Applies to court
          </span>
          <select
            className={`${selectClass} w-full`}
            value={form.courtId}
            onChange={(e) => setForm({ ...form, courtId: e.target.value })}
          >
            <option value="">All courts</option>
            {courts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <div>
          <span className="mb-1.5 block text-[13px] font-medium text-white/70">Days</span>
          <div className="flex flex-wrap gap-1.5">
            {DAY_NAMES.map((label, day) => (
              <button
                key={label}
                type="button"
                onClick={() => toggleDay(day)}
                aria-pressed={form.daysOfWeek.includes(day)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  form.daysOfWeek.includes(day)
                    ? "bg-pickle-500 text-ink"
                    : "bg-white/5 text-white/55 hover:bg-white/10"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-white/35">Leave empty to apply every day.</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="mb-1.5 block text-[13px] font-medium text-white/70">From</span>
            <select
              className={`${selectClass} w-full`}
              value={form.startMin}
              onChange={(e) => setForm({ ...form, startMin: Number(e.target.value) })}
            >
              {Array.from({ length: 48 }, (_, i) => i * 30).map((m) => (
                <option key={m} value={m}>
                  {minutesToLabel(m)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1.5 block text-[13px] font-medium text-white/70">To</span>
            <select
              className={`${selectClass} w-full`}
              value={form.endMin}
              onChange={(e) => setForm({ ...form, endMin: Number(e.target.value) })}
            >
              {Array.from({ length: 48 }, (_, i) => (i + 1) * 30).map((m) => (
                <option key={m} value={m}>
                  {minutesToLabel(m)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Rate per hour (₱)">
            <input
              type="number"
              min={0}
              step={50}
              className={inputClass}
              value={form.pricePerHour / 100}
              onChange={(e) =>
                setForm({ ...form, pricePerHour: Math.round(Number(e.target.value) * 100) })
              }
            />
          </Field>
          <Field label="Priority" hint="Higher wins.">
            <input
              type="number"
              min={0}
              className={inputClass}
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
            />
          </Field>
        </div>

        <Button
          className="w-full"
          loading={busy}
          disabled={!form.name}
          onClick={() =>
            run(
              () =>
                api("/api/admin/pricing-rules", {
                  body: { ...form, courtId: form.courtId || null },
                }),
              { success: "Pricing rule created.", onDone: onCreated },
            )
          }
        >
          Create rule
        </Button>
      </div>
    </Modal>
  );
}
