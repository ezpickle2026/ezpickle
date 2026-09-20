"use client";
import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { api, ApiError } from "@/lib/client";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export { Button } from "@/components/ui/button";
export { Badge, Card, Field, inputClass, EmptyState, Skeleton } from "@/components/ui/primitives";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">{title}</h1>
        {description && <p className="mt-1 text-sm text-white/45">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "default" | "green" | "amber" | "red";
}) {
  const tones = {
    default: "text-white",
    green: "text-pickle-400",
    amber: "text-amber-300",
    red: "text-red-300",
  } as const;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-2xl border border-white/10 bg-ink-card/70 p-5"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">{label}</p>
      <p className={cn("mt-2 text-2xl font-bold tabular-nums", tones[tone])}>{value}</p>
      {hint && <p className="mt-1 text-xs text-white/35">{hint}</p>}
    </motion.div>
  );
}

export function Table({
  head,
  children,
  minWidth = 720,
}: {
  head: string[];
  children: React.ReactNode;
  minWidth?: number;
}) {
  return (
    <div className="ezp-scroll overflow-x-auto rounded-2xl border border-white/10 bg-ink-card/60">
      <table className="w-full text-sm" style={{ minWidth }}>
        <thead>
          <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-[0.14em] text-white/35">
            {head.map((label) => (
              <th key={label} className="whitespace-nowrap px-4 py-3 font-semibold">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Row({ children }: { children: React.ReactNode }) {
  return (
    <tr className="border-b border-white/5 transition last:border-0 hover:bg-white/[0.03]">
      {children}
    </tr>
  );
}

export function Cell({
  children,
  className,
  align = "left",
}: {
  children: React.ReactNode;
  className?: string;
  align?: "left" | "right";
}) {
  return (
    <td
      className={cn(
        "px-4 py-3 align-middle text-white/75",
        align === "right" && "text-right",
        className,
      )}
    >
      {children}
    </td>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm sm:p-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <motion.div
            className={cn(
              "w-full rounded-2xl border border-white/12 bg-ink-card p-6 shadow-card",
              wide ? "max-w-3xl" : "max-w-lg",
            )}
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <h2 className="text-lg font-semibold text-white">{title}</h2>
              <button
                onClick={onClose}
                className="rounded-full p-1.5 text-white/45 transition hover:bg-white/10 hover:text-white"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Small confirm helper so destructive actions always ask first. */
export function confirmAction(message: string) {
  return window.confirm(message);
}

/**
 * Fetch-once-and-refresh hook used by every admin screen. Keeps the error
 * handling (and the customer-safe message) in one place.
 */
export function useResource<T>(path: string | null) {
  const toast = useToast();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      setData(await api<T>(path));
    } catch (error) {
      toast.push(error instanceof ApiError ? error.message : "Couldn't load this page.", "error");
    } finally {
      setLoading(false);
    }
  }, [path, toast]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, reload, setData };
}

/** Wraps a mutation so every admin action reports success or failure the same way. */
export function useMutate() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async <T,>(
      fn: () => Promise<T>,
      options: { success?: string; onDone?: () => void | Promise<void> } = {},
    ): Promise<T | null> => {
      setBusy(true);
      try {
        const result = await fn();
        if (options.success) toast.push(options.success);
        await options.onDone?.();
        return result;
      } catch (error) {
        toast.push(
          error instanceof ApiError ? error.message : "Something went wrong. Please try again.",
          "error",
        );
        return null;
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );

  return { run, busy };
}

export const selectClass =
  "rounded-xl border border-white/12 bg-ink-card px-3 py-2 text-sm text-white focus:border-pickle-500/60 focus:outline-none";

export function Pagination({
  page,
  pages,
  onPage,
}: {
  page: number;
  pages: number;
  onPage: (page: number) => void;
}) {
  if (pages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-white/50">
      <span>
        Page {page} of {pages}
      </span>
      <div className="flex gap-2">
        <button
          className="rounded-lg border border-white/12 px-3 py-1.5 transition hover:bg-white/5 disabled:opacity-40"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Previous
        </button>
        <button
          className="rounded-lg border border-white/12 px-3 py-1.5 transition hover:bg-white/5 disabled:opacity-40"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}

export function fmtDate(iso: string | Date, opts?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    day: "numeric",
    month: "short",
    year: "numeric",
    ...opts,
  }).format(new Date(iso));
}

export function fmtTime(iso: string | Date) {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function minutesToLabel(minutes: number) {
  const h24 = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const suffix = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}
