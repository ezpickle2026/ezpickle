import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { formatManila } from "@/lib/time";
import { OpenPlayDetail } from "@/components/open-play-detail";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const session = await prisma.openPlaySession.findUnique({ where: { id } });
  if (!session) return { title: "Open Play" };

  return {
    title: session.title,
    description: `EzPickle Open Play on ${formatManila(session.startAt, "EEEE d MMMM")} — join as an individual and get stacked into balanced groups.`,
    alternates: { canonical: `/open-play/${id}` },
  };
}

export default async function OpenPlaySessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [session, user] = await Promise.all([
    prisma.openPlaySession.findUnique({ where: { id }, select: { id: true } }),
    getSessionUser(),
  ]);
  if (!session) notFound();

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-10 sm:py-14">
      <OpenPlayDetail sessionId={session.id} signedIn={Boolean(user)} />
    </div>
  );
}
