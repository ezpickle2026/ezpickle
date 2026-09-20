"use client";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/** Fills from 0 on mount and re-animates whenever `taken` changes. */
export function CapacityBar({
  taken,
  max,
  className,
}: {
  taken: number;
  max: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const pct = max > 0 ? Math.min(100, Math.round((taken / max) * 100)) : 0;
  const full = taken >= max;

  return (
    <div
      className={cn("h-2 w-full overflow-hidden rounded-full bg-white/8", className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={taken}
      aria-label={`${taken} of ${max} players registered`}
    >
      <motion.div
        className={cn("h-full rounded-full", full ? "bg-amber-400" : "bg-pickle-500")}
        initial={reduced ? false : { width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}
