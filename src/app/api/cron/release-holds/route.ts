import { NextResponse } from "next/server";
import { releaseExpiredHolds } from "@/lib/holds";
import { env } from "@/lib/env";
import { timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sweeper for expired payment holds. Wire to Vercel Cron (every minute) or any
 * external scheduler. Protected by a shared secret, not by obscurity.
 */
export async function POST(request: Request) {
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const expected = env.CRON_SECRET;

  if (!expected) return NextResponse.json({ error: "cron not configured" }, { status: 503 });

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await releaseExpiredHolds();
  return NextResponse.json({ ok: true, ...result });
}

export const GET = POST;
