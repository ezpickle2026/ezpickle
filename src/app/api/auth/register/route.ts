import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { createSession, clientIp } from "@/lib/auth";
import { registerSchema } from "@/lib/validation";
import { route, ok, readJson } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { headers } from "next/headers";

export const POST = route(async (request: Request) => {
  const hdrs = await headers();
  await rateLimit(`register:${clientIp(hdrs) ?? "unknown"}`, 5, 600);

  const input = registerSchema.parse(await readJson(request));

  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new AppError("An account with that email already exists.", 409, "email_taken");
  }

  const user = await prisma.user.create({
    data: {
      email: input.email,
      fullName: input.fullName,
      mobile: input.mobile,
      passwordHash: await hashPassword(input.password),
      role: "CUSTOMER",
    },
  });

  await createSession(user.id);

  return ok({ id: user.id, email: user.email, fullName: user.fullName, role: user.role });
});
