"use client";
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Skeleton,
  StatCard,
  Table,
  Row,
  Cell as Td,
  fmtDate,
  fmtTime,
  useResource,
} from "@/components/admin/ui";
import { peso } from "@/lib/utils";

type Dashboard = {
  date: string;
  revenueToday: number;
  transactionsToday: number;
  bookingsToday: number;
  utilization: number;
  courtsTotal: number;
  courtsOccupied: number;
  courtsAvailable: number;
  openPlayPlayers: number;
  openPlaySessions: number;
  pendingPayments: number;
  cancelledToday: number;
  lowStock: { id: string; name: string; stock: number; minStock: number }[];
  upcoming: {
    id: string;
    reference: string;
    court: string;
    customer: string;
    startAt: string;
    endAt: string;
    status: string;
  }[];
  revenueByChannel: { channel: string; total: number }[];
};

const CHANNEL_LABEL: Record<string, string> = {
  COURT_BOOKING: "Courts",
  OPEN_PLAY: "Open Play",
  PRODUCT: "Products",
  RENTAL: "Rentals",
  OTHER: "Other",
};

export default function AdminDashboardPage() {
  const { data, loading } = useResource<Dashboard>("/api/admin/dashboard");

  if (loading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-56" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const chartData = data.revenueByChannel.map((row) => ({
    name: CHANNEL_LABEL[row.channel] ?? row.channel,
    total: row.total / 100,
  }));

  return (
    <div>
      <PageHeader
        title="Today at EzPickle"
        description={fmtDate(data.date, { weekday: "long" })}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Today's revenue"
          value={peso(data.revenueToday)}
          hint={`${data.transactionsToday} transactions`}
          tone="green"
        />
        <StatCard
          label="Today's bookings"
          value={data.bookingsToday}
          hint={`${data.cancelledToday} cancelled`}
        />
        <StatCard
          label="Court utilization"
          value={`${data.utilization}%`}
          hint={`${data.courtsOccupied} of ${data.courtsTotal} courts in play now`}
        />
        <StatCard
          label="Active Open Play"
          value={data.openPlayPlayers}
          hint={`${data.openPlaySessions} sessions today`}
        />
        <StatCard
          label="Pending payments"
          value={data.pendingPayments}
          hint="Holds awaiting checkout"
          tone={data.pendingPayments > 0 ? "amber" : "default"}
        />
        <StatCard
          label="Low stock"
          value={data.lowStock.length}
          hint="Products at or below minimum"
          tone={data.lowStock.length > 0 ? "red" : "default"}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-white/40">
            Revenue by category · last 7 days
          </h2>
          {chartData.length === 0 ? (
            <p className="py-10 text-center text-sm text-white/35">No sales in the last week.</p>
          ) : (
            <div className="mt-4 h-60">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 12 }} axisLine={false} tickLine={false} width={56} />
                  <Tooltip
                    cursor={{ fill: "rgba(255,255,255,0.04)" }}
                    contentStyle={{
                      background: "#131313",
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 12,
                      color: "#fff",
                    }}
                    formatter={(value: number) => [`₱${value.toLocaleString("en-PH")}`, "Revenue"]}
                  />
                  <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                    {chartData.map((entry) => (
                      <Cell key={entry.name} fill="#6FCF2B" />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card>
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-white/40">
            Inventory alerts
          </h2>
          {data.lowStock.length === 0 ? (
            <p className="py-10 text-center text-sm text-white/35">Everything is well stocked.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {data.lowStock.map((product) => (
                <li
                  key={product.id}
                  className="flex items-center justify-between rounded-xl bg-white/[0.04] px-3 py-2 text-sm"
                >
                  <span className="text-white/80">{product.name}</span>
                  <Badge tone={product.stock === 0 ? "red" : "amber"}>
                    {product.stock} left
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/admin/inventory"
            className="mt-4 inline-block text-sm font-semibold text-pickle-400 hover:text-pickle-300"
          >
            Manage inventory →
          </Link>
        </Card>
      </div>

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-white/40">
          Next up
        </h2>
        {data.upcoming.length === 0 ? (
          <EmptyState title="Nothing on the schedule" description="No upcoming bookings right now." />
        ) : (
          <Table head={["Reference", "Customer", "Court", "When", "Status"]}>
            {data.upcoming.map((booking) => (
              <Row key={booking.id}>
                <Td className="font-mono text-xs">{booking.reference}</Td>
                <Td>{booking.customer}</Td>
                <Td>{booking.court}</Td>
                <Td>
                  {fmtDate(booking.startAt, { weekday: "short" })} · {fmtTime(booking.startAt)} –{" "}
                  {fmtTime(booking.endAt)}
                </Td>
                <Td>
                  <Badge tone={booking.status === "CONFIRMED" ? "green" : "amber"}>
                    {booking.status.replace(/_/g, " ").toLowerCase()}
                  </Badge>
                </Td>
              </Row>
            ))}
          </Table>
        )}
      </section>
    </div>
  );
}
