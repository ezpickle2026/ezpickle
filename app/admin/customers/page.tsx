"use client";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import {
  Badge,
  Card,
  Cell as Td,
  EmptyState,
  Field,
  PageHeader,
  Pagination,
  Row,
  Skeleton,
  Table,
  fmtDate,
  inputClass,
  useResource,
} from "@/components/admin/ui";
import { peso } from "@/lib/utils";

type Customer = {
  id: string;
  fullName: string;
  email: string;
  mobile: string | null;
  status: string;
  totalBookings: number;
  openPlaySessions: number;
  lastBooking: string | null;
  totalSpend: number;
};

type Response = { customers: Customer[]; total: number; page: number; pages: number };

export default function AdminCustomersPage() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page) });
    if (q) params.set("q", q);
    return `/api/admin/customers?${params}`;
  }, [q, page]);

  const { data, loading } = useResource<Response>(query);

  return (
    <div>
      <PageHeader title="Customers" description="Everyone who has ever booked or played with you." />

      <Card className="mb-5">
        <div className="max-w-sm">
          <Field label="Search">
            <div className="relative">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/30"
                aria-hidden
              />
              <input
                className={`${inputClass} pl-9`}
                placeholder="Name, email or mobile"
                value={q}
                onChange={(e) => {
                  setPage(1);
                  setQ(e.target.value);
                }}
              />
            </div>
          </Field>
        </div>
      </Card>

      {loading && !data ? (
        <Skeleton className="h-72 w-full" />
      ) : !data || data.customers.length === 0 ? (
        <EmptyState title="No customers found" description="Try a different search term." />
      ) : (
        <>
          <Table
            head={["Customer", "Contact", "Bookings", "Open Play", "Total spend", "Last booking", "Status"]}
            minWidth={920}
          >
            {data.customers.map((customer) => (
              <Row key={customer.id}>
                <Td className="font-medium text-white/90">{customer.fullName}</Td>
                <Td>
                  <span className="block text-white/70">{customer.email}</span>
                  <span className="block text-xs text-white/35">{customer.mobile ?? "—"}</span>
                </Td>
                <Td align="right" className="tabular-nums">
                  {customer.totalBookings}
                </Td>
                <Td align="right" className="tabular-nums">
                  {customer.openPlaySessions}
                </Td>
                <Td align="right" className="tabular-nums">
                  {peso(customer.totalSpend)}
                </Td>
                <Td>{customer.lastBooking ? fmtDate(customer.lastBooking) : "—"}</Td>
                <Td>
                  <Badge tone={customer.status === "ACTIVE" ? "green" : "neutral"}>
                    {customer.status.toLowerCase()}
                  </Badge>
                </Td>
              </Row>
            ))}
          </Table>
          <Pagination page={data.page} pages={data.pages} onPage={setPage} />
        </>
      )}
    </div>
  );
}
