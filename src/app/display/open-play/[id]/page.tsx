import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { CourtDisplay } from "@/components/court-display";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Court Display",
  robots: { index: false, follow: false },
};

/**
 * Full-screen court board for a second monitor or TV at the venue. Lives
 * outside /admin so it renders without the admin sidebar, but is still gated
 * to staff — the data comes from the staff-only session API.
 */
export default async function CourtDisplayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/display/open-play/${id}`)}`);
  if (!can(user.role, "openplay:read")) redirect("/dashboard");

  return <CourtDisplay sessionId={id} />;
}
