/** Standalone runner for the hold sweeper (cron/systemd timer alternative). */
import { releaseExpiredHolds } from "../src/lib/holds";

releaseExpiredHolds()
  .then((r) => console.log(`Released ${r.bookings} booking holds, ${r.openPlay} open play holds.`))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
