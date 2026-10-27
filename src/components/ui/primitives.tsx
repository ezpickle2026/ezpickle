"use client";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/10 bg-ink-card/70 p-5 shadow-card backdrop-blur-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "green" | "red" | "amber" | "neutral";
  children: React.ReactNode;
}) {
  const tones = {
    green: "bg-pickle-500/15 text-pickle-300 ring-pickle-500/30",
    red: "bg-red-500/15 text-red-300 ring-red-500/30",
    amber: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
    neutral: "bg-white/5 text-white/70 ring-white/15",
  } as const;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function StatusDot({ state }: { state: "AVAILABLE" | "BOOKED" | "HELD" | "BLOCKED" }) {
  const map = {
    AVAILABLE: "bg-pickle-500 animate-pulseDot",
    BOOKED: "bg-red-500",
    HELD: "bg-amber-400 animate-pulseDot",
    BLOCKED: "bg-white/25",
  } as const;
  return <span className={cn("inline-block size-2 rounded-full", map[state])} aria-hidden />;
}

/** Scroll-triggered entrance. Collapses to a no-op under reduced motion. */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;

  return (
    <motion.div
      initial={{ opacity: 0, y: 18, scale: 0.985 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("ezp-skeleton rounded-xl", className)} />;
}

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-white/70">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-white/40">{hint}</span>}
      {error && (
        <span role="alert" className="mt-1 block text-xs text-red-400">
          {error}
        </span>
      )}
    </label>
  );
}

export const inputClass =
  "w-full rounded-xl border border-white/12 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white placeholder:text-white/30 transition focus:border-pickle-500/60 focus:bg-white/[0.06] focus:outline-none";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-white/12 px-6 py-14 text-center">
      <p className="text-base font-semibold text-white/85">{title}</p>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-white/45">{description}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
