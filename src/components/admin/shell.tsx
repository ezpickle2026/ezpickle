"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  BarChart3,
  Boxes,
  CalendarDays,
  ClipboardList,
  Image as ImageIcon,
  LayoutDashboard,
  LogOut,
  type LucideIcon,
  Menu,
  QrCode,
  Receipt,
  ScrollText,
  Settings,
  Ticket,
  Users,
  Users2,
  X,
} from "lucide-react";
import { api } from "@/lib/client";
import { Logo } from "@/components/logo";
import { can, type Permission } from "@/lib/rbac";
import type { Role } from "@prisma/client";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: LucideIcon; permission: Permission };

const NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, permission: "booking:read" },
  { href: "/admin/calendar", label: "Calendar", icon: CalendarDays, permission: "booking:read" },
  { href: "/admin/bookings", label: "Bookings", icon: ClipboardList, permission: "booking:read" },
  { href: "/admin/checkin", label: "Check-in", icon: QrCode, permission: "checkin:write" },
  { href: "/admin/courts", label: "Courts", icon: Activity, permission: "court:read" },
  { href: "/admin/open-play", label: "Open Play", icon: Users2, permission: "openplay:read" },
  { href: "/admin/customers", label: "Customers", icon: Users, permission: "customer:read" },
  { href: "/admin/inventory", label: "Inventory", icon: Boxes, permission: "inventory:read" },
  { href: "/admin/sales", label: "Sales", icon: Receipt, permission: "inventory:read" },
  { href: "/admin/reports", label: "Reports", icon: BarChart3, permission: "report:read" },
  { href: "/admin/users", label: "Users", icon: Users, permission: "user:manage" },
  { href: "/admin/media", label: "Media", icon: ImageIcon, permission: "media:write" },
  { href: "/admin/promos", label: "Promos", icon: Ticket, permission: "promo:write" },
  { href: "/admin/settings", label: "Settings", icon: Settings, permission: "settings:write" },
  { href: "/admin/audit", label: "Audit Logs", icon: ScrollText, permission: "audit:read" },
];

export function AdminShell({
  user,
  children,
}: {
  user: { fullName: string; email: string; role: Role };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  // The sidebar only shows what this role can actually reach; the API enforces
  // the same permissions independently.
  const items = NAV.filter((item) => can(user.role, item.permission));

  async function signOut() {
    await api("/api/auth/logout", { body: {} }).catch(() => {});
    router.push("/login");
    router.refresh();
  }

  const nav = (
    <nav className="flex flex-col gap-0.5" aria-label="Admin sections">
      {items.map((item) => {
        const active =
          item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
              active ? "text-white" : "text-white/50 hover:bg-white/5 hover:text-white",
            )}
          >
            {active && (
              <motion.span
                layoutId="admin-nav-active"
                className="absolute inset-0 rounded-xl bg-pickle-500/15 ring-1 ring-inset ring-pickle-500/30"
                transition={{ type: "spring", stiffness: 400, damping: 34 }}
              />
            )}
            <Icon size={17} className={cn("relative", active && "text-pickle-400")} aria-hidden />
            <span className="relative">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-ink">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-white/8 bg-ink-soft px-3 py-5 lg:flex">
        <Link href="/" className="mb-6 px-2" aria-label="EzPickle home">
          <Logo className="h-7 w-auto" />
        </Link>
        <div className="ezp-scroll flex-1 overflow-y-auto">{nav}</div>
        <button
          onClick={signOut}
          className="mt-3 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/45 transition hover:bg-white/5 hover:text-white"
        >
          <LogOut size={17} aria-hidden />
          Sign out
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-white/8 bg-ink/85 px-4 py-3 backdrop-blur">
          <button
            className="rounded-lg p-2 text-white/60 transition hover:bg-white/5 hover:text-white lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold text-white">{user.fullName}</p>
              <p className="text-[11px] uppercase tracking-wider text-pickle-400">
                {user.role.replace("_", " ").toLowerCase()}
              </p>
            </div>
            <span
              className="flex size-9 items-center justify-center rounded-full bg-pickle-500/20 text-sm font-bold text-pickle-300"
              aria-hidden
            >
              {user.fullName.slice(0, 2).toUpperCase()}
            </span>
          </div>
        </header>

        <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className="fixed inset-0 z-50 bg-black/70 lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileOpen(false)}
          >
            <motion.div
              className="ezp-scroll h-full w-64 overflow-y-auto border-r border-white/10 bg-ink-soft px-3 py-5"
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "spring", stiffness: 380, damping: 36 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-6 flex items-center justify-between px-2">
                <Logo className="h-7 w-auto" />
                <button
                  onClick={() => setMobileOpen(false)}
                  className="rounded-lg p-1.5 text-white/50 hover:text-white"
                  aria-label="Close menu"
                >
                  <X size={18} />
                </button>
              </div>
              {nav}
              <button
                onClick={signOut}
                className="mt-3 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/45 transition hover:bg-white/5 hover:text-white"
              >
                <LogOut size={17} aria-hidden />
                Sign out
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
