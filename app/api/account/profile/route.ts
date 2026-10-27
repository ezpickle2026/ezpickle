import { prisma } from "@/lib/prisma";
import { requireUser, assertCsrf } from "@/lib/auth";
import { profileSchema } from "@/lib/validation";
import { route, ok, readJson } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const user = await requireUser();
  const profile = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: {
      id: true,
      fullName: true,
      email: true,
      mobile: true,
      avatarUrl: true,
      emergencyContact: true,
      createdAt: true,
    },
  });
  return ok({ profile });
});

export const PATCH = route(async (request: Request) => {
  await assertCsrf(request);
  const user = await requireUser();
  const input = profileSchema.parse(await readJson(request));

  // Email and role are deliberately not editable here — changing an email is
  // an identity change and needs its own verified flow.
  const profile = await prisma.user.update({
    where: { id: user.id },
    data: {
      fullName: input.fullName,
      mobile: input.mobile,
      emergencyContact: input.emergencyContact ?? null,
      avatarUrl: input.avatarUrl ?? null,
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      mobile: true,
      avatarUrl: true,
      emergencyContact: true,
    },
  });

  return ok({ profile });
});
