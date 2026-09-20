import { Role } from "@prisma/client";

export const PERMISSIONS = {
  "booking:read": [Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF],
  "booking:write": [Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF],
  "booking:refund": [Role.SUPER_ADMIN, Role.ADMIN],
  "court:read": [Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF],
  "court:write": [Role.SUPER_ADMIN, Role.ADMIN],
  "customer:read": [Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF],
  "customer:write": [Role.SUPER_ADMIN, Role.ADMIN],
  "openplay:read": [Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF],
  "openplay:write": [Role.SUPER_ADMIN, Role.ADMIN],
  "inventory:read": [Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF],
  "inventory:write": [Role.SUPER_ADMIN, Role.ADMIN],
  "sales:read": [Role.SUPER_ADMIN, Role.ADMIN],
  "report:read": [Role.SUPER_ADMIN, Role.ADMIN],
  "media:write": [Role.SUPER_ADMIN, Role.ADMIN],
  "promo:write": [Role.SUPER_ADMIN, Role.ADMIN],
  "checkin:write": [Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF],
  "user:manage": [Role.SUPER_ADMIN],
  "settings:write": [Role.SUPER_ADMIN],
  "audit:read": [Role.SUPER_ADMIN, Role.ADMIN],
} as const;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role | undefined, permission: Permission): boolean {
  if (!role) return false;
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

export const STAFF_ROLES: Role[] = [Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF];
