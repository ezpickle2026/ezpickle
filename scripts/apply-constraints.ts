/**
 * Applies prisma/sql/constraints.sql. Prisma cannot express GiST exclusion
 * constraints, so they live in a plain SQL file and are applied after the
 * tables exist. Every statement is idempotent, so it is safe to run on every
 * deploy.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const raw = readFileSync(path.join(process.cwd(), "prisma/sql/constraints.sql"), "utf8");

  // Strip comment lines FIRST. Comments may contain ';' which would otherwise
  // split a sentence into a bogus SQL statement.
  const sql = raw
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }
  console.log(`Applied ${statements.length} database constraints.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
