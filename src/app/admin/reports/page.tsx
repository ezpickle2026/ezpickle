"use client";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download } from "lucide-react";
import { api, downloadCsv } from "@/lib/client";
import {
  Button,
  Card,
  Cell as Td,
  PageHeader,
  Row,
  Skeleton,
  StatCard,
  Table,
  minutesToLabel,
  selectClass,
  useMutate,
  useResource,
} from "@/components/admin/ui";
import { peso, cn } from "@/lib/utils";

type SalesReport = {
  gross: number;
  discounts: number;
  net: number;
  transactions: number;
  refunds: { amount: number; count: number };
  byChannel: { channel: string; total: number; discount: number; count: number }[];
  byMethod: { method: string; total: number }[];
  byCourt: { court: string; total: number }[];
  series: { date: string; total: number }[];
};

type UtilizationReport = {
  courts: {
    courtId: string;
    court: string;
    bookedHours: number;
    availableHours: number;
    utilization: number;
    bookings: number;
    revenue: number;
  }[];
  overall: { utilization: number; bookings: number };
  peakHours: { hour: number; count: number }[];
  dailyUtilization: { date: string; utilization: number }[];
};

type InventoryReport = {
  summary: {
    skuCount: number;
    inventoryValue: number;
    retailValue: number;
    lowStock: number;
    outOfStock: number;
  };
  lowStock: { id: string; name: string; sku: string; stock: number; minStock: number }[];
  movements: {
    id: string;
    type: string;
    quantity: number;
    createdAt: string;
    product: { name: string; sku: string };
    user: { fullName: string } | null;
  }[];
  bestSellers: { productId: string | null; name: string; quantity: number; revenue: number }[];
};

const TABS = ["Sales", "Utilization", "Inventory"] as const;
type Tab = (typeof TABS)[number];

const RANGES = [
  ["today", "Today"],
  ["yesterday", "Yesterday"],
  ["this_week", "Last 7 days"],
  ["this_month", "This month"],
  ["last_month", "Last month"],
  ["custom", "Custom"],
] as const;

const AXIS = { fill: "rgba(255,255,255,0.45)", fontSize: 12 };
const TOOLTIP_STYLE = {
  background: "#131313",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 12,
  color: "#fff",
};

export default function AdminReportsPage() {
  const [tab, setTab] = useState<Tab>("Sales");
  const [range, setRange] = useState("this_month");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const { run, busy } = useMutate();

  const query = useMemo(() => {
    const params = new URLSearchParams({ range });
    if (range === "custom") {
      if (custom.from) params.set("from", custom.from);
      if (custom.to) params.set("to", custom.to);
    }
    return params.toString();
  }, [range, custom]);

  const endpoint =
    tab === "Sales" ? "sales" : tab === "Utilization" ? "utilization" : "inventory";

  const sales = useResource<SalesReport>(
    tab === "Sales" ? `/api/admin/reports/sales?${query}` : null,
  );
  const utilization = useResource<UtilizationReport>(
    tab === "Utilization" ? `/api/admin/reports/utilization?${query}` : null,
  );
  const inventory = useResource<InventoryReport>(
    tab === "Inventory" ? `/api/admin/reports/inventory?${query}` : null,
  );

  function exportCsv() {
    void run(
      async () => {
        const blob = await api<Blob>(`/api/admin/reports/${endpoint}?${query}&format=csv`);
        downloadCsv(blob, `ezpickle-${endpoint}.csv`);
      },
      { success: "Export downloaded." },
    );
  }

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Revenue, court utilization and inventory movement. Everything exports to CSV."
        actions={
          <Button variant="secondary" loading={busy} onClick={exportCsv}>
            <Download size={16} aria-hidden />
            Export CSV
          </Button>
        }
      />

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div className="flex gap-1.5">
          {TABS.map((item) => (
            <button
              key={item}
              onClick={() => setTab(item)}
              aria-pressed={tab === item}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-sm font-medium transition",
                tab === item ? "bg-pickle-500 text-ink" : "bg-white/5 text-white/55 hover:bg-white/10",
              )}
            >
              {item}
            </button>
          ))}
        </div>

        <select
          className={`${selectClass} ml-auto`}
          value={range}
          onChange={(e) => setRange(e.target.value)}
          aria-label="Date range"
        >
          {RANGES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        {range === "custom" && (
          <>
            <input
              type="date"
              className={selectClass}
              value={custom.from}
              onChange={(e) => setCustom({ ...custom, from: e.target.value })}
              aria-label="From"
            />
            <input
              type="date"
              className={selectClass}
              value={custom.to}
              onChange={(e) => setCustom({ ...custom, to: e.target.value })}
              aria-label="To"
            />
          </>
        )}
      </div>

      {tab === "Sales" &&
        (sales.loading || !sales.data ? (
          <Skeleton className="h-80 w-full" />
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Net revenue" value={peso(sales.data.net)} tone="green" />
              <StatCard label="Gross" value={peso(sales.data.gross)} hint={`${peso(sales.data.discounts)} discounted`} />
              <StatCard label="Transactions" value={sales.data.transactions} />
              <StatCard
                label="Refunds"
                value={peso(sales.data.refunds.amount)}
                hint={`${sales.data.refunds.count} refunded`}
                tone={sales.data.refunds.count > 0 ? "red" : "default"}
              />
            </div>

            <Card>
              <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-white/40">
                Daily revenue
              </h2>
              <div className="mt-4 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={sales.data.series.map((d) => ({ ...d, total: d.total / 100 }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" vertical={false} />
                    <XAxis dataKey="date" tick={AXIS} axisLine={false} tickLine={false} />
                    <YAxis tick={AXIS} axisLine={false} tickLine={false} width={64} />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(value: number) => [`₱${value.toLocaleString("en-PH")}`, "Revenue"]}
                    />
                    <Line
                      type="monotone"
                      dataKey="total"
                      stroke="#6FCF2B"
                      strokeWidth={2.5}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <div className="grid gap-4 lg:grid-cols-3">
              <Card>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-white/40">
                  By category
                </h2>
                <BreakdownList
                  rows={sales.data.byChannel.map((c) => ({
                    label: c.channel.replace(/_/g, " ").toLowerCase(),
                    value: c.total,
                  }))}
                />
              </Card>
              <Card>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-white/40">
                  By payment method
                </h2>
                <BreakdownList
                  rows={sales.data.byMethod.map((m) => ({ label: m.method, value: m.total }))}
                />
              </Card>
              <Card>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-white/40">
                  By court
                </h2>
                <BreakdownList
                  rows={sales.data.byCourt.map((c) => ({ label: c.court, value: c.total }))}
                />
              </Card>
            </div>
          </div>
        ))}

      {tab === "Utilization" &&
        (utilization.loading || !utilization.data ? (
          <Skeleton className="h-80 w-full" />
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <StatCard
                label="Average utilization"
                value={`${utilization.data.overall.utilization}%`}
                tone="green"
              />
              <StatCard label="Bookings in range" value={utilization.data.overall.bookings} />
            </div>

            <Card>
              <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-white/40">
                Peak hours
              </h2>
              <div className="mt-4 h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={utilization.data.peakHours.map((h) => ({
                      hour: minutesToLabel(h.hour * 60),
                      count: h.count,
                    }))}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" vertical={false} />
                    <XAxis dataKey="hour" tick={AXIS} axisLine={false} tickLine={false} />
                    <YAxis tick={AXIS} axisLine={false} tickLine={false} width={40} allowDecimals={false} />
                    <Tooltip
                      cursor={{ fill: "rgba(255,255,255,0.04)" }}
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(value: number) => [value, "Bookings"]}
                    />
                    <Bar dataKey="count" fill="#6FCF2B" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Table head={["Court", "Booked hours", "Available", "Utilization", "Bookings", "Revenue"]}>
              {utilization.data.courts.map((court) => (
                <Row key={court.courtId}>
                  <Td className="font-medium text-white/90">{court.court}</Td>
                  <Td align="right" className="tabular-nums">
                    {court.bookedHours}
                  </Td>
                  <Td align="right" className="tabular-nums">
                    {court.availableHours}
                  </Td>
                  <Td align="right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="tabular-nums">{court.utilization}%</span>
                      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-white/10">
                        <span
                          className="block h-full rounded-full bg-pickle-500"
                          style={{ width: `${Math.min(100, court.utilization)}%` }}
                        />
                      </span>
                    </div>
                  </Td>
                  <Td align="right" className="tabular-nums">
                    {court.bookings}
                  </Td>
                  <Td align="right">{peso(court.revenue)}</Td>
                </Row>
              ))}
            </Table>
          </div>
        ))}

      {tab === "Inventory" &&
        (inventory.loading || !inventory.data ? (
          <Skeleton className="h-80 w-full" />
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="SKUs" value={inventory.data.summary.skuCount} />
              <StatCard
                label="Stock value (cost)"
                value={peso(inventory.data.summary.inventoryValue)}
                tone="green"
              />
              <StatCard label="Retail value" value={peso(inventory.data.summary.retailValue)} />
              <StatCard
                label="Low / out of stock"
                value={`${inventory.data.summary.lowStock} / ${inventory.data.summary.outOfStock}`}
                tone={inventory.data.summary.outOfStock > 0 ? "red" : "amber"}
              />
            </div>

            <Card>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-white/40">
                Best sellers
              </h2>
              <BreakdownList
                rows={inventory.data.bestSellers.map((b) => ({
                  label: `${b.name} · ${b.quantity} sold`,
                  value: b.revenue,
                }))}
              />
            </Card>

            <div>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-white/40">
                Stock movements
              </h2>
              <Table head={["When", "Product", "Movement", "Qty", "Staff"]}>
                {inventory.data.movements.slice(0, 50).map((movement) => (
                  <Row key={movement.id}>
                    <Td>
                      {new Intl.DateTimeFormat("en-PH", {
                        timeZone: "Asia/Manila",
                        day: "numeric",
                        month: "short",
                        hour: "numeric",
                        minute: "2-digit",
                      }).format(new Date(movement.createdAt))}
                    </Td>
                    <Td>{movement.product.name}</Td>
                    <Td className="capitalize">{movement.type.replace(/_/g, " ").toLowerCase()}</Td>
                    <Td
                      align="right"
                      className={cn(
                        "tabular-nums font-semibold",
                        movement.quantity < 0 ? "text-red-300" : "text-pickle-400",
                      )}
                    >
                      {movement.quantity > 0 ? `+${movement.quantity}` : movement.quantity}
                    </Td>
                    <Td>{movement.user?.fullName ?? "System"}</Td>
                  </Row>
                ))}
              </Table>
            </div>
          </div>
        ))}
    </div>
  );
}

function BreakdownList({ rows }: { rows: { label: string; value: number }[] }) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-white/30">No data in this range.</p>;
  }
  const max = Math.max(...rows.map((r) => r.value), 1);

  return (
    <ul className="space-y-2.5">
      {rows.map((row) => (
        <li key={row.label}>
          <div className="flex items-baseline justify-between text-sm">
            <span className="capitalize text-white/70">{row.label}</span>
            <span className="font-semibold text-white">{peso(row.value)}</span>
          </div>
          <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-white/8">
            <span
              className="block h-full rounded-full bg-pickle-500"
              style={{ width: `${Math.round((row.value / max) * 100)}%` }}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}
