import "server-only";
import { headers } from "next/headers";
import { prisma } from "./prisma";
import { clientIp } from "./auth";

export async function audit(params: {
  userId?: string | null;
  actorEmail?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}) {
  try {
    const hdrs = await headers();
    await prisma.auditLog.create({
      data: {
        userId: params.userId ?? null,
        actorEmail: params.actorEmail ?? null,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId ?? null,
        before: (params.before ?? undefined) as never,
        after: (params.after ?? undefined) as never,
        ip: clientIp(hdrs),
        userAgent: hdrs.get("user-agent")?.slice(0, 255) ?? null,
      },
    });
  } catch (error) {
    // Auditing must never break the business action it is recording.
    console.error("[audit] failed to write entry", error);
  }
}
