import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { createSession, clientIp } from "@/lib/auth";
import { loginSchema } from "@/lib/validation";
import { route, ok, readJson } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { headers } from "next/headers";

export const POST = route(async (request: Request) => {
  const hdrs = await headers();
  const input = loginSchema.parse(await readJson(request));

  // Limit by IP and by account, so neither a single host nor a single target
  // can be hammered.
  await rateLimit(`login:ip:${clientIp(hdrs) ?? "unknown"}`, 10, 300);
  await rateLimit(`login:acct:${input.email}`, 6, 300);

  const user = await prisma.user.findUnique({ where: { email: input.email } });

  // Same response and similar timing whether or not the account exists.
  const valid = user ? await verifyPassword(input.password, user.passwordHash) : false;
  if (!user || !valid || user.deletedAt) {
    throw new AppError("Incorrect email or password.", 401, "invalid_credentials");
  }
  if (user.status !== "ACTIVE") {
    throw new AppError("This account has been disabled.", 403, "account_disabled");
  }

  await createSession(user.id);

  return ok({ id: user.id, email: user.email, fullName: user.fullName, role: user.role });
});
