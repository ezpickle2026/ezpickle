import { prisma } from "@/lib/prisma";
import { requireUser, assertCsrf, revokeAllSessions, createSession } from "@/lib/auth";
import { changePasswordSchema } from "@/lib/validation";
import { hashPassword, verifyPassword } from "@/lib/password";
import { route, ok, readJson } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { AppError } from "@/lib/errors";

export const POST = route(async (request: Request) => {
  await assertCsrf(request);
  const user = await requireUser();
  await rateLimit(`password:change:${user.id}`, 8, 900);

  const input = changePasswordSchema.parse(await readJson(request));

  const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!(await verifyPassword(input.currentPassword, row.passwordHash))) {
    throw new AppError("Your current password is incorrect.", 400, "bad_password");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(input.newPassword) },
  });

  // A password change invalidates every other device, then re-issues a session
  // for the current one so the customer is not kicked out mid-flow.
  await revokeAllSessions(user.id);
  await createSession(user.id);

  return ok({ changed: true });
});
