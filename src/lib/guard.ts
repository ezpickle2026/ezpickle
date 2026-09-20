import "server-only";
import { requireUser, type SessionUser } from "./auth";
import { can, type Permission } from "./rbac";
import { Errors } from "./errors";

/**
 * Server-side authorization. Hiding buttons in the UI is cosmetic; this is
 * what actually protects the endpoint.
 */
export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.role, permission)) throw Errors.forbidden();
  return user;
}
