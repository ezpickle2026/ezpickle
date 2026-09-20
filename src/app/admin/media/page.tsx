"use client";
import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Star, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/client";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  Skeleton,
  confirmAction,
  inputClass,
  useMutate,
  useResource,
} from "@/components/admin/ui";

type Image = {
  id: string;
  url: string;
  title: string | null;
  caption: string | null;
  sortOrder: number;
  featured: boolean;
  active: boolean;
};

export default function AdminMediaPage() {
  const { data, loading, reload } = useResource<{ images: Image[] }>("/api/admin/media");
  const { run, busy } = useMutate();
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({
    url: "",
    title: "",
    caption: "",
    sortOrder: 0,
    featured: false,
    active: true,
  });

  const images = data?.images ?? [];

  /** Swap two neighbours and persist the whole order in one request. */
  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= images.length) return;
    const next = [...images];
    [next[index], next[target]] = [next[target], next[index]];

    await run(
      () =>
        api("/api/admin/media", {
          method: "PUT",
          body: { order: next.map((image, i) => ({ id: image.id, sortOrder: i })) },
        }),
      { success: "Order saved.", onDone: reload },
    );
  }

  return (
    <div>
      <PageHeader
        title="Media"
        description="Facility slideshow images. Order here is the order customers see on the homepage."
        actions={
          <Button onClick={() => setAddOpen(true)}>
            <Plus size={16} aria-hidden />
            Add image
          </Button>
        }
      />

      {loading && !data ? (
        <Skeleton className="h-64 w-full" />
      ) : images.length === 0 ? (
        <EmptyState
          title="No images yet"
          description="Add photos of the courts, lobby and facilities to bring the homepage to life."
          action={<Button onClick={() => setAddOpen(true)}>Add the first image</Button>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence initial={false}>
            {images.map((image, index) => (
              <motion.div
                key={image.id}
                layout
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              >
                <Card className="p-0">
                  <div className="relative aspect-video overflow-hidden rounded-t-2xl bg-white/5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={image.url}
                      alt={image.title ?? "Facility photo"}
                      className="size-full object-cover"
                      loading="lazy"
                    />
                    {image.featured && (
                      <span className="absolute left-3 top-3">
                        <Badge tone="green">Featured</Badge>
                      </span>
                    )}
                    {!image.active && (
                      <span className="absolute right-3 top-3">
                        <Badge>Hidden</Badge>
                      </span>
                    )}
                  </div>

                  <div className="p-4">
                    <p className="truncate text-sm font-semibold text-white">
                      {image.title ?? "Untitled"}
                    </p>
                    {image.caption && (
                      <p className="mt-0.5 truncate text-xs text-white/40">{image.caption}</p>
                    )}

                    <div className="mt-3 flex flex-wrap gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy || index === 0}
                        onClick={() => move(index, -1)}
                        aria-label="Move earlier"
                      >
                        <ArrowUp size={14} />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy || index === images.length - 1}
                        onClick={() => move(index, 1)}
                        aria-label="Move later"
                      >
                        <ArrowDown size={14} />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() =>
                          run(
                            () =>
                              api(`/api/admin/media/${image.id}`, {
                                method: "PATCH",
                                body: { featured: !image.featured },
                              }),
                            { success: "Image updated.", onDone: reload },
                          )
                        }
                      >
                        <Star size={14} />
                        {image.featured ? "Unfeature" : "Feature"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() =>
                          run(
                            () =>
                              api(`/api/admin/media/${image.id}`, {
                                method: "PATCH",
                                body: { active: !image.active },
                              }),
                            { success: "Image updated.", onDone: reload },
                          )
                        }
                      >
                        {image.active ? "Hide" : "Show"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => {
                          if (!confirmAction("Delete this image?")) return;
                          void run(
                            () => api(`/api/admin/media/${image.id}`, { method: "DELETE" }),
                            { success: "Image deleted.", onDone: reload },
                          );
                        }}
                        aria-label="Delete"
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add facility image">
        <div className="space-y-4">
          <Field
            label="Image URL"
            hint="Paste a hosted URL. Configure Supabase storage in .env to upload files directly instead."
          >
            <input
              className={inputClass}
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="https://…"
            />
          </Field>
          {form.url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={form.url}
              alt="Preview"
              className="aspect-video w-full rounded-xl object-cover"
            />
          )}
          <Field label="Title">
            <input
              className={inputClass}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </Field>
          <Field label="Caption">
            <input
              className={inputClass}
              value={form.caption}
              onChange={(e) => setForm({ ...form, caption: e.target.value })}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm text-white/70">
            <input
              type="checkbox"
              className="size-4 accent-pickle-500"
              checked={form.featured}
              onChange={(e) => setForm({ ...form, featured: e.target.checked })}
            />
            Feature on the homepage hero
          </label>
          <Button
            className="w-full"
            loading={busy}
            disabled={!form.url}
            onClick={() =>
              run(
                () =>
                  api("/api/admin/media", {
                    body: {
                      ...form,
                      title: form.title || null,
                      caption: form.caption || null,
                      sortOrder: images.length,
                    },
                  }),
                {
                  success: "Image added.",
                  onDone: async () => {
                    setAddOpen(false);
                    setForm({ ...form, url: "", title: "", caption: "" });
                    await reload();
                  },
                },
              )
            }
          >
            Add image
          </Button>
        </div>
      </Modal>
    </div>
  );
}
