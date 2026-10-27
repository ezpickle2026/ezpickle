export const dynamic = "force-dynamic";

/** Used by Railway to know the app has started. Deliberately does not touch the DB. */
export function GET() {
  return Response.json({ ok: true });
}
