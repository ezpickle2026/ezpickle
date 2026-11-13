import { z } from "zod";
import { requirePermission } from "@/lib/guard";
import { assertCsrf } from "@/lib/auth";
import { setOperator } from "@/lib/openplay";
import { route, ok, readJson } from "@/lib/api";
import { audit } from "@/lib/audit";

/** Assigns one paid member as the session's stacking operator (null clears it). */
export const PUT = route(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  await assertCsrf(request);
  const { id } = await ctx.params;
  const admin = await requirePermission("openplay:write");

  const { userId } = z
    .object({ userId: z.string().min(1).nullable() })
    .parse(await readJson(request));

  const session = await setOperator(id, userId);

  await audit({
    userId: admin.id,
    actorEmail: admin.email,
    action: "openplay.set_operator",
    entity: "OpenPlaySession",
    entityId: id,
    after: { operatorUserId: userId },
  });

  return ok({ operator: session.operator });
});
