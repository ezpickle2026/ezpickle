/**
 * Runs once when the server starts. On Railway the app is a long-running
 * process, so we run the payment-hold sweeper on a timer here instead of
 * relying on Vercel Cron. It is idempotent, so overlapping runs are harmless.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { releaseExpiredHolds } = await import("@/lib/holds");

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const r = await releaseExpiredHolds();
      if (r.bookings || r.openPlay || r.offers) {
        console.log(`[sweeper] released ${r.bookings} bookings, ${r.openPlay} open play, ${r.offers} offers`);
      }
    } catch (error) {
      console.error("[sweeper] failed", error);
    } finally {
      running = false;
    }
  };

  setInterval(tick, 60_000).unref();
}
