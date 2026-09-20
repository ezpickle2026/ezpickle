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
  StatCard,
  Table,
  confirmAction,
  inputClass,
  selectClass,
  useMutate,
  useResource,
} from "@/components/admin/ui";
import { peso } from "@/lib/utils";

type Product = {
  id: string;
  name: string;
  sku: string;
  category: string;
  description: string | null;
  cost: number;
  price: number;
  stock: number;
  minStock: number;
  supplier: string | null;
  rentable: boolean;
  active: boolean;
};

type Response = {
  products: Product[];
  summary: {
    skuCount: number;
    inventoryValue: number;
    retailValue: number;
    lowStock: number;
    outOfStock: number;
  };
};

const MOVEMENTS = ["PURCHASE", "SALE", "DAMAGED", "ADJUSTMENT", "RETURN", "RENTAL_OUT", "RENTAL_IN"];

const blank = {
  name: "",
  sku: "",
  category: "Equipment",
  description: "",
  cost: 0,
  price: 0,
  minStock: 5,
  supplier: "",
  rentable: false,
  active: true,
};

export default function AdminInventoryPage() {
  const [lowOnly, setLowOnly] = useState(false);
  const { data, loading, reload } = useResource<Response>(
    `/api/admin/products${lowOnly ? "?low=1" : ""}`,
  );
  const { run, busy } = useMutate();

  const [editing, setEditing] = useState<(typeof blank & { id?: string }) | null>(null);
  const [stockFor, setStockFor] = useState<Product | null>(null);

  async function save() {
    if (!editing) return;
    const { id, ...payload } = editing;
    await run(
      () =>
        id
          ? api(`/api/admin/products/${id}`, { method: "PATCH", body: payload })
          : api("/api/admin/products", { body: payload }),
      {
        success: id ? "Product updated." : "Product added.",
        onDone: async () => {
          setEditing(null);
          await reload();
        },
      },
    );
  }

  return (
    <div>
      <PageHeader
        title="Inventory"
        description="Products, stock levels and the movement ledger behind them."
        actions={
          <>
            <Button variant="secondary" onClick={() => setLowOnly((v) => !v)}>
              {lowOnly ? "Show all" : "Low stock only"}
            </Button>
            <Button onClick={() => setEditing({ ...blank })}>
              <Plus size={16} aria-hidden />
              Add product
            </Button>
          </>
        }
      />

      {data && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="SKUs" value={data.summary.skuCount} />
          <StatCard label="Stock value (cost)" value={peso(data.summary.inventoryValue)} tone="green" />
          <StatCard label="Retail value" value={peso(data.summary.retailValue)} />
          <StatCard
            label="Needs restocking"
            value={data.summary.lowStock + data.summary.outOfStock}
            hint={`${data.summary.outOfStock} out of stock`}
            tone={data.summary.outOfStock > 0 ? "red" : "amber"}
          />
        </div>
      )}

      {loading && !data ? (
        <Skeleton className="h-72 w-full" />
      ) : !data || data.products.length === 0 ? (
        <EmptyState
          title="Nothing in inventory yet"
          description="Add balls, paddles, drinks or rentals to start tracking stock."
        />
      ) : (
        <Table head={["SKU", "Product", "Category", "Cost", "Price", "Stock", "Status", ""]} minWidth={980}>
          {data.products.map((product) => (
            <Row key={product.id}>
              <Td className="font-mono text-xs">{product.sku}</Td>
              <Td className="font-medium text-white/90">{product.name}</Td>
              <Td>{product.category}</Td>
              <Td align="right">{peso(product.cost)}</Td>
              <Td align="right">{peso(product.price)}</Td>
              <Td align="right" className="tabular-nums">
                {product.stock}
                <span className="ml-1 text-xs text-white/30">/ min {product.minStock}</span>
              </Td>
              <Td>
                <Badge
                  tone={
                    product.stock === 0 ? "red" : product.stock <= product.minStock ? "amber" : "green"
                  }
                >
                  {product.stock === 0
                    ? "out of stock"
                    : product.stock <= product.minStock
                      ? "low"
                      : "in stock"}
                </Badge>
              </Td>
              <Td align="right">
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setStockFor(product)}>
                    Stock
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setEditing({
                        id: product.id,
                        name: product.name,
                        sku: product.sku,
                        category: product.category,
                        description: product.description ?? "",
                        cost: product.cost,
                        price: product.price,
                        minStock: product.minStock,
                        supplier: product.supplier ?? "",
                        rentable: product.rentable,
                        active: product.active,
                      })
                    }
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                      if (!confirmAction(`Deactivate ${product.name}?`)) return;
                      void run(() => api(`/api/admin/products/${product.id}`, { method: "DELETE" }), {
                        success: "Product deactivated.",
                        onDone: reload,
                      });
                    }}
                  >
                    Remove
                  </Button>
                </div>
              </Td>
            </Row>
          ))}
        </Table>
      )}

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.id ? "Edit product" : "Add product"}
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
              <Field label="SKU">
                <input
                  className={inputClass}
                  value={editing.sku}
                  onChange={(e) => setEditing({ ...editing, sku: e.target.value.toUpperCase() })}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Category">
                <input
                  className={inputClass}
                  value={editing.category}
                  onChange={(e) => setEditing({ ...editing, category: e.target.value })}
                />
              </Field>
              <Field label="Supplier">
                <input
                  className={inputClass}
                  value={editing.supplier}
                  onChange={(e) => setEditing({ ...editing, supplier: e.target.value })}
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
            <div className="grid grid-cols-3 gap-3">
              <Field label="Cost (₱)">
                <input
                  type="number"
                  min={0}
                  step={1}
                  className={inputClass}
                  value={editing.cost / 100}
                  onChange={(e) =>
                    setEditing({ ...editing, cost: Math.round(Number(e.target.value) * 100) })
                  }
                />
              </Field>
              <Field label="Price (₱)">
                <input
                  type="number"
                  min={0}
                  step={1}
                  className={inputClass}
                  value={editing.price / 100}
                  onChange={(e) =>
                    setEditing({ ...editing, price: Math.round(Number(e.target.value) * 100) })
                  }
                />
              </Field>
              <Field label="Min stock">
                <input
                  type="number"
                  min={0}
                  className={inputClass}
                  value={editing.minStock}
                  onChange={(e) => setEditing({ ...editing, minStock: Number(e.target.value) })}
                />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm text-white/70">
              <input
                type="checkbox"
                className="size-4 accent-pickle-500"
                checked={editing.rentable}
                onChange={(e) => setEditing({ ...editing, rentable: e.target.checked })}
              />
              Available as a rental
            </label>
            <Button className="w-full" loading={busy} onClick={save}>
              {editing.id ? "Save changes" : "Add product"}
            </Button>
          </div>
        )}
      </Modal>

      <StockModal
        product={stockFor}
        onClose={() => setStockFor(null)}
        onDone={async () => {
          setStockFor(null);
          await reload();
        }}
      />
    </div>
  );
}

function StockModal({
  product,
  onClose,
  onDone,
}: {
  product: Product | null;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const { run, busy } = useMutate();
  const [form, setForm] = useState({ type: "PURCHASE", quantity: 10, note: "" });

  return (
    <Modal open={Boolean(product)} onClose={onClose} title={`Stock · ${product?.name ?? ""}`}>
      <div className="space-y-4">
        <p className="text-sm text-white/45">
          Current stock: <span className="font-semibold text-white">{product?.stock ?? 0}</span>.
          Every movement is written to the ledger with your name against it.
        </p>
        <label className="block text-sm">
          <span className="mb-1.5 block text-[13px] font-medium text-white/70">Movement</span>
          <select
            className={`${selectClass} w-full`}
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
          >
            {MOVEMENTS.map((m) => (
              <option key={m} value={m}>
                {m.replace(/_/g, " ").toLowerCase()}
              </option>
            ))}
          </select>
        </label>
        <Field
          label="Quantity"
          hint="Positive adds stock, negative removes it. A sale or damage is negative."
        >
          <input
            type="number"
            className={inputClass}
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
          />
        </Field>
        <Field label="Note">
          <input
            className={inputClass}
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
        </Field>
        <Button
          className="w-full"
          loading={busy}
          onClick={() =>
            run(
              () =>
                api(`/api/admin/products/${product!.id}/stock`, {
                  body: { ...form, note: form.note || null },
                }),
              { success: "Stock updated.", onDone },
            )
          }
        >
          Record movement
        </Button>
      </div>
    </Modal>
  );
}
