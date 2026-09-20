"use client";
import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
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
  fmtDate,
  fmtTime,
  inputClass,
  selectClass,
  useMutate,
  useResource,
} from "@/components/admin/ui";
import { peso } from "@/lib/utils";

type Sale = {
  id: string;
  reference: string;
  channel: string;
  soldAt: string;
  subtotal: number;
  discount: number;
  total: number;
  paymentMethod: string;
  status: string;
  customer: { fullName: string; email: string } | null;
  staff: { fullName: string } | null;
  items: { id: string; description: string; quantity: number; unitPrice: number; total: number }[];
};

type Response = { sales: Sale[]; total: number; page: number; pages: number };
type Product = { id: string; name: string; price: number; stock: number; active: boolean };

type LineItem = {
  productId: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
};

export default function AdminSalesPage() {
  const [page, setPage] = useState(1);
  const [range, setRange] = useState({ from: "", to: "", channel: "" });
  const [newSaleOpen, setNewSaleOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page) });
    for (const [key, value] of Object.entries(range)) if (value) params.set(key, value);
    return `/api/admin/sales?${params}`;
  }, [page, range]);

  const { data, loading, reload } = useResource<Response>(query);

  return (
    <div>
      <PageHeader
        title="Sales"
        description="Every transaction: court bookings, Open Play, counter sales and rentals."
        actions={
          <Button onClick={() => setNewSaleOpen(true)}>
            <Plus size={16} aria-hidden />
            Counter sale
          </Button>
        }
      />

      <Card className="mb-5">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1.5 block text-[13px] font-medium text-white/70">From</span>
            <input
              type="date"
              className={selectClass}
              value={range.from}
              onChange={(e) => {
                setPage(1);
                setRange({ ...range, from: e.target.value });
              }}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1.5 block text-[13px] font-medium text-white/70">To</span>
            <input
              type="date"
              className={selectClass}
              value={range.to}
              onChange={(e) => {
                setPage(1);
                setRange({ ...range, to: e.target.value });
              }}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1.5 block text-[13px] font-medium text-white/70">Channel</span>
            <select
              className={selectClass}
              value={range.channel}
              onChange={(e) => {
                setPage(1);
                setRange({ ...range, channel: e.target.value });
              }}
            >
              <option value="">All</option>
              {["COURT_BOOKING", "OPEN_PLAY", "PRODUCT", "RENTAL", "OTHER"].map((c) => (
                <option key={c} value={c}>
                  {c.replace(/_/g, " ").toLowerCase()}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Card>

      {loading && !data ? (
        <Skeleton className="h-72 w-full" />
      ) : !data || data.sales.length === 0 ? (
        <EmptyState title="No sales in this range" description="Try widening the dates." />
      ) : (
        <>
          <Table
            head={["Reference", "When", "Channel", "Customer", "Staff", "Method", "Total", ""]}
            minWidth={980}
          >
            {data.sales.map((sale) => (
              <Row key={sale.id}>
                <Td className="font-mono text-xs">{sale.reference}</Td>
                <Td>
                  {fmtDate(sale.soldAt)} · {fmtTime(sale.soldAt)}
                </Td>
                <Td className="capitalize">{sale.channel.replace(/_/g, " ").toLowerCase()}</Td>
                <Td>{sale.customer?.fullName ?? "Walk-in"}</Td>
                <Td>{sale.staff?.fullName ?? "—"}</Td>
                <Td className="capitalize">{sale.paymentMethod.replace(/_/g, " ")}</Td>
                <Td align="right">
                  <span className="font-semibold text-white">{peso(sale.total)}</span>
                  {sale.discount > 0 && (
                    <span className="ml-1 text-xs text-white/35">−{peso(sale.discount)}</span>
                  )}
                </Td>
                <Td align="right">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setExpanded(expanded === sale.id ? null : sale.id)}
                  >
                    {expanded === sale.id ? "Hide" : "Items"}
                  </Button>
                </Td>
              </Row>
            ))}
          </Table>

          {expanded && (
            <Card className="mt-4">
              <p className="mb-3 text-[11px] uppercase tracking-[0.14em] text-white/35">
                Line items
              </p>
              <ul className="space-y-1.5 text-sm">
                {data.sales
                  .find((s) => s.id === expanded)
                  ?.items.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between rounded-xl bg-white/[0.04] px-3 py-2"
                    >
                      <span className="text-white/80">
                        {item.quantity} × {item.description}
                      </span>
                      <span className="font-semibold text-white">{peso(item.total)}</span>
                    </li>
                  ))}
              </ul>
            </Card>
          )}

          <Pagination page={data.page} pages={data.pages} onPage={setPage} />
        </>
      )}

      <CounterSaleModal
        open={newSaleOpen}
        onClose={() => setNewSaleOpen(false)}
        onDone={async () => {
          setNewSaleOpen(false);
          await reload();
        }}
      />
    </div>
  );
}

function CounterSaleModal({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const { run, busy } = useMutate();
  const [products, setProducts] = useState<Product[]>([]);
  const [items, setItems] = useState<LineItem[]>([]);
  const [discount, setDiscount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [channel, setChannel] = useState("PRODUCT");

  useEffect(() => {
    if (!open) return;
    api<{ products: Product[] }>("/api/admin/products")
      .then((r) => setProducts(r.products.filter((p) => p.active)))
      .catch(() => setProducts([]));
  }, [open]);

  const subtotal = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);

  function addProduct(id: string) {
    const product = products.find((p) => p.id === id);
    if (!product) return;
    setItems((current) => {
      const existing = current.find((i) => i.productId === id);
      if (existing) {
        return current.map((i) =>
          i.productId === id ? { ...i, quantity: i.quantity + 1 } : i,
        );
      }
      return [
        ...current,
        { productId: id, description: product.name, quantity: 1, unitPrice: product.price },
      ];
    });
  }

  return (
    <Modal open={open} onClose={onClose} title="Counter sale" wide>
      <div className="space-y-4">
        <label className="block text-sm">
          <span className="mb-1.5 block text-[13px] font-medium text-white/70">Add product</span>
          <select
            className={`${selectClass} w-full`}
            value=""
            onChange={(e) => e.target.value && addProduct(e.target.value)}
          >
            <option value="">Select a product…</option>
            {products.map((product) => (
              <option key={product.id} value={product.id} disabled={product.stock <= 0}>
                {product.name} · {peso(product.price)} ({product.stock} in stock)
              </option>
            ))}
          </select>
        </label>

        {items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/12 px-4 py-8 text-center text-sm text-white/35">
            No items yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((item, index) => (
              <li
                key={index}
                className="flex flex-wrap items-center gap-3 rounded-xl bg-white/[0.04] px-3 py-2"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-white/85">
                  {item.description}
                </span>
                <input
                  type="number"
                  min={1}
                  className={`${selectClass} w-20`}
                  value={item.quantity}
                  onChange={(e) =>
                    setItems((current) =>
                      current.map((i, idx) =>
                        idx === index ? { ...i, quantity: Math.max(1, Number(e.target.value)) } : i,
                      ),
                    )
                  }
                  aria-label={`Quantity for ${item.description}`}
                />
                <span className="w-24 text-right text-sm font-semibold text-white">
                  {peso(item.unitPrice * item.quantity)}
                </span>
                <button
                  onClick={() => setItems((current) => current.filter((_, idx) => idx !== index))}
                  className="rounded-lg p-1.5 text-white/40 transition hover:bg-white/10 hover:text-red-300"
                  aria-label={`Remove ${item.description}`}
                >
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="grid grid-cols-3 gap-3">
          <label className="text-sm">
            <span className="mb-1.5 block text-[13px] font-medium text-white/70">Channel</span>
            <select
              className={`${selectClass} w-full`}
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
            >
              <option value="PRODUCT">Product</option>
              <option value="RENTAL">Rental</option>
              <option value="OTHER">Other</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1.5 block text-[13px] font-medium text-white/70">Payment</span>
            <select
              className={`${selectClass} w-full`}
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
            >
              <option value="cash">Cash</option>
              <option value="gcash">GCash</option>
              <option value="maya">Maya</option>
              <option value="card">Card</option>
            </select>
          </label>
          <Field label="Discount (₱)">
            <input
              type="number"
              min={0}
              className={inputClass}
              value={discount / 100}
              onChange={(e) => setDiscount(Math.round(Number(e.target.value) * 100))}
            />
          </Field>
        </div>

        <div className="flex items-center justify-between rounded-xl bg-pickle-500/10 px-4 py-3">
          <span className="text-sm font-medium text-white/70">Total due</span>
          <span className="text-xl font-bold text-pickle-400">
            {peso(Math.max(0, subtotal - discount))}
          </span>
        </div>

        <Button
          className="w-full"
          loading={busy}
          disabled={items.length === 0}
          onClick={() =>
            run(
              () => api("/api/admin/sales", { body: { channel, paymentMethod, discount, items } }),
              {
                success: "Sale recorded and stock deducted.",
                onDone: async () => {
                  setItems([]);
                  setDiscount(0);
                  await onDone();
                },
              },
            )
          }
        >
          Complete sale
        </Button>
      </div>
    </Modal>
  );
}
