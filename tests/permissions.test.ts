import { describe, expect, it } from "vitest";
import { Role } from "@prisma/client";
import { PERMISSIONS, STAFF_ROLES, can, type Permission } from "@/lib/rbac";

const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

describe("permission matrix", () => {
  it("gives SUPER_ADMIN every permission", () => {
    for (const permission of ALL_PERMISSIONS) {
      expect(can(Role.SUPER_ADMIN, permission)).toBe(true);
    }
  });

  it("denies customers every admin permission", () => {
    for (const permission of ALL_PERMISSIONS) {
      expect(can(Role.CUSTOMER, permission)).toBe(false);
    }
  });

  it("denies an undefined role every permission", () => {
    for (const permission of ALL_PERMISSIONS) {
      expect(can(undefined, permission)).toBe(false);
    }
  });

  it("keeps user management and settings to SUPER_ADMIN alone", () => {
    for (const permission of ["user:manage", "settings:write"] as Permission[]) {
      expect(can(Role.SUPER_ADMIN, permission)).toBe(true);
      expect(can(Role.ADMIN, permission)).toBe(false);
      expect(can(Role.STAFF, permission)).toBe(false);
    }
  });

  it("lets ADMIN refund but not STAFF", () => {
    expect(can(Role.ADMIN, "booking:refund")).toBe(true);
    expect(can(Role.STAFF, "booking:refund")).toBe(false);
  });

  it("lets STAFF run the front desk", () => {
    for (const permission of [
      "booking:read",
      "booking:write",
      "checkin:write",
      "customer:read",
      "inventory:read",
    ] as Permission[]) {
      expect(can(Role.STAFF, permission)).toBe(true);
    }
  });

  it("keeps STAFF out of reports, sales totals and configuration", () => {
    for (const permission of [
      "report:read",
      "sales:read",
      "court:write",
      "promo:write",
      "media:write",
      "audit:read",
      "openplay:write",
      "inventory:write",
    ] as Permission[]) {
      expect(can(Role.STAFF, permission)).toBe(false);
    }
  });

  it("treats every admin permission as a superset going up the hierarchy", () => {
    // Anything STAFF can do, ADMIN can do; anything ADMIN can do, SUPER_ADMIN can.
    for (const permission of ALL_PERMISSIONS) {
      if (can(Role.STAFF, permission)) expect(can(Role.ADMIN, permission)).toBe(true);
      if (can(Role.ADMIN, permission)) expect(can(Role.SUPER_ADMIN, permission)).toBe(true);
    }
  });

  it("never grants a permission to CUSTOMER via STAFF_ROLES", () => {
    expect(STAFF_ROLES).not.toContain(Role.CUSTOMER);
    expect(STAFF_ROLES).toEqual([Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF]);
  });

  it("has no permission that nobody holds", () => {
    for (const permission of ALL_PERMISSIONS) {
      expect((PERMISSIONS[permission] as readonly Role[]).length).toBeGreaterThan(0);
    }
  });
});
