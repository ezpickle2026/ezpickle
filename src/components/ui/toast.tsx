"use client";
import { AnimatePresence, motion } from "framer-motion";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle, Info } from "lucide-react";

type Variant = "success" | "error" | "warning" | "info";
type Toast = { id: number; message: string; variant: Variant };

const ToastContext = createContext<{ push: (message: string, variant?: Variant) => void }>({
  push: () => {},
});

export const useToast = () => useContext(ToastContext);

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
} as const;

const TONES = {
  success: "border-pickle-500/40 text-pickle-300",
  error: "border-red-500/40 text-red-300",
  warning: "border-amber-500/40 text-amber-300",
  info: "border-white/15 text-white/80",
} as const;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((message: string, variant: Variant = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-3), { id, message, variant }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 sm:bottom-6"
        role="status"
        aria-live="polite"
      >
        <AnimatePresence initial={false}>
          {toasts.map((toast) => {
            const Icon = ICONS[toast.variant];
            return (
              <motion.div
                key={toast.id}
                initial={{ opacity: 0, y: 16, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border bg-ink-card/95 px-4 py-3 text-sm shadow-card backdrop-blur ${TONES[toast.variant]}`}
              >
                <Icon size={18} className="mt-0.5 shrink-0" aria-hidden />
                <span className="text-white/90">{toast.message}</span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
