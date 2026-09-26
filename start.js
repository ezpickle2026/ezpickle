/**
 * Railway start script.
 *
 * Railway (and most non-Vercel hosts) don't have a separate "build vs.
 * release" step the way some platforms do, so this file does both jobs
 * every time the app boots:
 *
 *   1. Apply any pending Prisma migrations (`prisma migrate deploy`).
 *   2. Re-apply the hand-written SQL constraints (safe to repeat — every
 *      statement in constraints.sql drops-then-recreates, so running it
 *      ten times in a row has the same effect as running it once).
 *   3. Start the actual Next.js server.
 *
 * This means a brand new deployment finishes with a fully-migrated,
 * fully-constrained database with zero manual steps. Seeding is
 * deliberately NOT run here — seed.ts deletes existing data before
 * recreating it, which must never happen on every restart. Run seeding
 * once, by hand, from Railway's "Run a command" shell:
 *
 *   npm run db:seed
 */
const { execSync } = require("node:child_process");

function run(command) {
  console.log(`\n$ ${command}`);
  execSync(command, { stdio: "inherit" });
}

try {
  console.log("== EzPickle boot: applying database migrations ==");
  run("npx prisma migrate deploy");

  console.log("\n== EzPickle boot: applying database constraints ==");
  run("npx tsx scripts/apply-constraints.ts");
} catch (error) {
  // A migration or constraint failure should stop the boot loudly rather
  // than silently serve a half-migrated database.
  console.error("\nEzPickle boot: database setup failed. Not starting the server.");
  console.error(error.message);
  process.exit(1);
}

console.log("\n== EzPickle boot: starting Next.js ==");
const port = process.env.PORT || "3000";
execSync(`npx next start -p ${port}`, { stdio: "inherit" });
