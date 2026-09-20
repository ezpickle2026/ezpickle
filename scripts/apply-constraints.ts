/**
 * Applies prisma/sql/constraints.sql. Prisma Migrate cannot express GiST
 * exclusion constraints, so they live here and are applied after migrations.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const sql = readFileSync(path.join(process.cwd(), "prisma/sql/constraints.sql"), "utf8");
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));

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
