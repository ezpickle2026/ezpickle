import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth";
import { STAFF_ROLES } from "@/lib/rbac";
import { AdminShell } from "@/components/admin/shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · EzPickle Admin" },
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();

  // First gate only. Every admin API re-checks permissions server-side, so
  // hiding the UI is a convenience, never the security boundary.
  if (!user) redirect("/login?next=%2Fadmin");
  if (!STAFF_ROLES.includes(user.role)) redirect("/dashboard");

  return (
    <AdminShell user={{ fullName: user.fullName, email: user.email, role: user.role }}>
      {children}
    </AdminShell>
  );
}
