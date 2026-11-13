import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { PickleCamLibrary } from "@/components/pickle-cam/library";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pickle Cam",
  robots: { index: false, follow: false },
};

export default async function PickleCamPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=%2Fpickle-cam");

  const settings = await getSettings();

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:py-14">
      <PickleCamLibrary address={settings.address} />
    </div>
  );
}
