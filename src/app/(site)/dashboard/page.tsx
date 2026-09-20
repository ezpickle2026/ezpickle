import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { CustomerDashboard } from "@/components/customer-dashboard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My bookings",
  robots: { index: false, follow: false },
};

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=%2Fdashboard");

  const settings = await getSettings();

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-10 sm:py-14">
      <CustomerDashboard name={user.fullName} cancellationPolicy={settings.cancellationPolicy} />
    </div>
  );
}
