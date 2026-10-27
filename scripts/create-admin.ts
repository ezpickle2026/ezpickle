/**
 * Creates the first SUPER_ADMIN account.
 *
 * Reads ADMIN_EMAIL, ADMIN_PASSWORD and (optional) ADMIN_NAME from the
 * environment. Safe to run on every deploy:
 *   - if the variables are not set, it does nothing
 *   - if a user with that email already exists, it does NOT touch it
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const fullName = process.env.ADMIN_NAME?.trim() || "Site Owner";

  if (!email || !password) {
    console.log("ADMIN_EMAIL / ADMIN_PASSWORD not set — skipping admin creation.");
    return;
  }

  if (password.length < 10 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    throw new Error("ADMIN_PASSWORD must be 10+ characters with a lowercase letter, an uppercase letter and a number.");
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin ${email} already exists — leaving it unchanged.`);
    return;
  }

  await prisma.user.create({
    data: {
      email,
      fullName,
      passwordHash: await bcrypt.hash(password, 12),
      role: "SUPER_ADMIN",
    },
  });
  console.log(`Created SUPER_ADMIN ${email}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
