"use client";
import { useMemo, useState } from "react";
import {
  Card,
  Cell as Td,
  EmptyState,
  PageHeader,
  Pagination,
  Row,
  Skeleton,
  Table,
  inputClass,
  useResource,
} from "@/components/admin/ui";

type Log = {
  id: string;
  action: string;
  entity: string | null;
  entityId: string | null;
  actorEmail: string | null;
  ip: string | null;
  before: unknown;
  after: unknown;
  createdAt: string;
};

type Response = { logs: Log[]; total: number; page: number; pages: number };

export default function AdminAuditPage() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ entity: "", action: "" });
  const [open, setOpen] = useState<string | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page) });
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
    return `/api/admin/audit?${params}`;
  }, [page, filters]);

  const { data, loading } = useResource<Response>(query);

  return (
    <div>
      <PageHeader
        title="Audit logs"
        description="Every privileged action, who took it and when. Append-only."
      />

      <Card className="mb-5">
        <div className="flex flex-wrap gap-3">
          <input
            className={`${inputClass} max-w-xs`}
            placeholder="Filter by entity, e.g. Booking"
            value={filters.entity}
            onChange={(e) => {
              setPage(1);
              setFilters({ ...filters, entity: e.target.value });
            }}
            aria-label="Filter by entity"
          />
          <input
            className={`${inputClass} max-w-xs`}
            placeholder="Filter by action, e.g. booking.refund"
            value={filters.action}
            onChange={(e) => {
              setPage(1);
              setFilters({ ...filters, action: e.target.value });
            }}
            aria-label="Filter by action"
          />
        </div>
      </Card>

      {loading && !data ? (
        <Skeleton className="h-72 w-full" />
      ) : !data || data.logs.length === 0 ? (
        <EmptyState title="No audit entries" description="Nothing matches those filters yet." />
      ) : (
        <>
          <Table head={["When", "Actor", "Action", "Entity", "IP", ""]} minWidth={900}>
            {data.logs.map((log) => (
              <Row key={log.id}>
                <Td>
                  {new Intl.DateTimeFormat("en-PH", {
                    timeZone: "Asia/Manila",
                    day: "numeric",
                    month: "short",
                    hour: "numeric",
                    minute: "2-digit",
                  }).format(new Date(log.createdAt))}
                </Td>
                <Td>{log.actorEmail ?? "System"}</Td>
                <Td className="font-mono text-xs text-pickle-400">{log.action}</Td>
                <Td>
                  {log.entity ?? "—"}
                  {log.entityId && (
                    <span className="ml-1 font-mono text-[10px] text-white/25">
                      {log.entityId.slice(-6)}
                    </span>
                  )}
                </Td>
                <Td className="text-xs text-white/40">{log.ip ?? "—"}</Td>
                <Td align="right">
                  <button
                    className="text-xs font-semibold text-pickle-400 hover:text-pickle-300"
                    onClick={() => setOpen(open === log.id ? null : log.id)}
                  >
                    {open === log.id ? "Hide" : "Details"}
                  </button>
                </Td>
              </Row>
            ))}
          </Table>

          {open && (
            <Card className="mt-4">
              <pre className="ezp-scroll max-h-72 overflow-auto text-xs text-white/60">
                {JSON.stringify(
                  data.logs.find((l) => l.id === open),
                  null,
                  2,
                )}
              </pre>
            </Card>
          )}

          <Pagination page={data.page} pages={data.pages} onPage={setPage} />
        </>
      )}
    </div>
  );
}
