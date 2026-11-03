/**
 * Runs before the database setup on every deploy. If DATABASE_URL is missing
 * it prints a plain explanation instead of Prisma's cryptic P1012 error.
 * Only variable NAMES are printed, never their values.
 */
const db = process.env.DATABASE_URL?.trim();

if (!db) {
  const related = Object.keys(process.env)
    .filter((k) => /^(PG|POSTGRES|DATABASE)/.test(k))
    .sort();
  console.error(`
==================================================================
 DATABASE_URL is ${process.env.DATABASE_URL === undefined ? "NOT SET" : "EMPTY"} on this service.

 In Railway: open THIS app service -> Variables -> + New Variable
 -> Add Reference -> pick your Postgres service -> DATABASE_URL.
 Then click "Deploy" to apply the staged change.

 If you typed \${{Postgres.DATABASE_URL}} by hand, the part before
 the dot must match the database service's name exactly.

 Database-related variables this service can see: ${related.length ? related.join(", ") : "(none)"}
==================================================================
`);
  process.exit(1);
}

if (!/^postgres(ql)?:\/\//.test(db)) {
  console.error("DATABASE_URL is set but does not start with postgresql:// — check its value in Railway.");
  process.exit(1);
}

console.log("Environment check passed.");
