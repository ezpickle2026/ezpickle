"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { api } from "@/lib/client";
import {
  Badge,
  Button,
  Cell as Td,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  Row,
  Skeleton,
  Table,
  fmtDate,
  inputClass,
  selectClass,
  useMutate,
  useResource,
} from "@/components/admin/ui";
import { peso } from "@/lib/utils";

type Promo = {
  id: string;
  code: string;
  description: string | null;
  discountType: "PERCENT" | "FIXED";
  value: number;
  startsAt: string | null;
  endsAt: string | null;
  usageLimit: number | null;
  perUserLimit: number | null;
  usageCount: number;
  minPurchase: number;
  active: boolean;
};

export default function AdminPromosPage() {
  const { data, loading, reload } = useResource<{ promos: Promo[] }>("/api/admin/promos");
  const { run, busy } = useMutate();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    code: "",
    description: "",
    discountType: "PERCENT" as "PERCENT" | "FIXED",
    value: 10,
    startsAt: "",
    endsAt: "",
    usageLimit: "",
    perUserLimit: "",
    minPurchase: 0,
    active: true,
  });

  function describe(promo: Promo) {
    return promo.discountType === "PERCENT" ? `${promo.value}% off` : `${peso(promo.value)} off`;
  }

  return (
    <div>
      <PageHeader
        title="Promo codes"
        description="Discounts applied at booking time. Limits are enforced server-side at redemption."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus size={16} aria-hidden />
            New code
          </Button>
        }
      />

      {loading && !data ? (
        <Skeleton className="h-64 w-full" />
      ) : !data || data.promos.length === 0 ? (
        <EmptyState
          title="No promo codes"
          description="Create a code to run a launch offer or a members' discount."
        />
      ) : (
        <Table
          head={["Code", "Discount", "Window", "Min spend", "Used", "Status", ""]}
          minWidth={900}
        >
          {data.promos.map((promo) => (
            <Row key={promo.id}>
              <Td>
                <span className="block font-mono text-sm font-semibold text-pickle-400">
                  {promo.code}
                </span>
                {promo.description && (
                  <span className="block text-xs text-white/35">{promo.description}</span>
                )}
              </Td>
              <Td>{describe(promo)}</Td>
              <Td className="text-xs text-white/60">
                {promo.startsAt ? fmtDate(promo.startsAt) : "Any time"} →{" "}
                {promo.endsAt ? fmtDate(promo.endsAt) : "No end"}
              </Td>
              <Td align="right">{promo.minPurchase ? peso(promo.minPurchase) : "—"}</Td>
              <Td align="right" className="tabular-nums">
                {promo.usageCount}
                {promo.usageLimit ? ` / ${promo.usageLimit}` : ""}
              </Td>
              <Td>
                <Badge tone={promo.active ? "green" : "neutral"}>
                  {promo.active ? "active" : "disabled"}
                </Badge>
              </Td>
              <Td align="right">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    run(
                      () =>
                        api("/api/admin/promos", {
                          method: "PATCH",
                          body: { id: promo.id, active: !promo.active },
                        }),
                      { success: "Promo updated.", onDone: reload },
                    )
                  }
                >
                  {promo.active ? "Disable" : "Enable"}
                </Button>
              </Td>
            </Row>
          ))}
        </Table>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="New promo code">
        <div className="space-y-4">
          <Field label="Code" hint="Customers type this at checkout. Case-insensitive.">
            <input
              className={inputClass}
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              placeholder="LAUNCH20"
            />
          </Field>
          <Field label="Description">
            <input
              className={inputClass}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="mb-1.5 block text-[13px] font-medium text-white/70">Type</span>
              <select
                className={`${selectClass} w-full`}
                value={form.discountType}
                onChange={(e) =>
                  setForm({ ...form, discountType: e.target.value as "PERCENT" | "FIXED" })
                }
              >
                <option value="PERCENT">Percentage off</option>
                <option value="FIXED">Fixed amount off</option>
              </select>
            </label>
            <Field label={form.discountType === "PERCENT" ? "Percent (%)" : "Amount (₱)"}>
              <input
                type="number"
                min={1}
                className={inputClass}
                value={form.discountType === "PERCENT" ? form.value : form.value / 100}
                onChange={(e) =>
                  setForm({
                    ...form,
                    value:
                      form.discountType === "PERCENT"
                        ? Number(e.target.value)
                        : Math.round(Number(e.target.value) * 100),
                  })
                }
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="mb-1.5 block text-[13px] font-medium text-white/70">Starts</span>
              <input
                type="date"
                className={`${selectClass} w-full`}
                value={form.startsAt}
                onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1.5 block text-[13px] font-medium text-white/70">Ends</span>
              <input
                type="date"
                className={`${selectClass} w-full`}
                value={form.endsAt}
                onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
              />
            </label>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Total uses">
              <input
                type="number"
                min={1}
                className={inputClass}
                value={form.usageLimit}
                onChange={(e) => setForm({ ...form, usageLimit: e.target.value })}
                placeholder="∞"
              />
            </Field>
            <Field label="Per customer">
              <input
                type="number"
                min={1}
                className={inputClass}
                value={form.perUserLimit}
                onChange={(e) => setForm({ ...form, perUserLimit: e.target.value })}
                placeholder="∞"
              />
            </Field>
            <Field label="Min spend (₱)">
              <input
                type="number"
                min={0}
                className={inputClass}
                value={form.minPurchase / 100}
                onChange={(e) =>
                  setForm({ ...form, minPurchase: Math.round(Number(e.target.value) * 100) })
                }
              />
            </Field>
          </div>

          <Button
            className="w-full"
            loading={busy}
            disabled={form.code.length < 3}
            onClick={() =>
              run(
                () =>
                  api("/api/admin/promos", {
                    body: {
                      ...form,
                      description: form.description || null,
                      startsAt: form.startsAt ? new Date(`${form.startsAt}T00:00:00+08:00`).toISOString() : null,
                      endsAt: form.endsAt ? new Date(`${form.endsAt}T23:59:59+08:00`).toISOString() : null,
                      usageLimit: form.usageLimit ? Number(form.usageLimit) : null,
                      perUserLimit: form.perUserLimit ? Number(form.perUserLimit) : null,
                    },
                  }),
                {
                  success: "Promo code created.",
                  onDone: async () => {
                    setOpen(false);
                    await reload();
                  },
                },
              )
            }
          >
            Create code
          </Button>
        </div>
      </Modal>
    </div>
  );
}
