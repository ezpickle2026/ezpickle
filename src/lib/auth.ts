import "server-only";
import { cookies, headers } from "next/headers";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Role, type User } from "@prisma/client";
import { prisma } from "./prisma";
import { env, isProd } from "./env";
import { Errors } from "./errors";

const COOKIE = "ezp_session";
const CSRF_COOKIE = "ezp_csrf";
const SESSION_DAYS = 14;

export type SessionUser = Pick<User, "id" | "email" | "fullName" | "role" | "status" | "avatarUrl">;

function hashToken(token: string) {
  return createHash("sha256").update(`${token}${env.SESSION_SECRET}`).digest("hex");
}

/** Opaque, DB-backed sessions: instantly revocable, unlike stateless JWTs. */
export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const hdrs = await headers();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5);

  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      userAgent: hdrs.get("user-agent")?.slice(0, 255) ?? null,
      ip: clientIp(hdrs),
    },
  });

  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    path: "/",
    expires: expiresAt,
  });
  jar.set(CSRF_COOKIE, randomBytes(16).toString("base64url"), {
    httpOnly: false,
    sameSite: "lax",
    secure: isProd,
    path: "/",
    expires: expiresAt,
  });

  await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  return token;
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    await prisma.session.updateMany({
      where: { tokenHash: hashToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  jar.delete(COOKIE);
  jar.delete(CSRF_COOKIE);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });

  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  if (session.user.status !== "ACTIVE" || session.user.deletedAt) return null;

  const { id, email, fullName, role, status, avatarUrl } = session.user;
  return { id, email, fullName, role, status, avatarUrl };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw Errors.unauthorized();
  return user;
}

export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) throw Errors.forbidden();
  return user;
}

/** Double-submit CSRF check for state-changing requests from the browser. */
export async function assertCsrf(request: Request) {
  const method = request.method.toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return;

  const jar = await cookies();
  const cookieToken = jar.get(CSRF_COOKIE)?.value;
  const headerToken = request.headers.get("x-csrf-token");
  if (!cookieToken || !headerToken) throw Errors.forbidden();

  const a = Buffer.from(cookieToken);
  const b = Buffer.from(headerToken);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw Errors.forbidden();
}

export function clientIp(hdrs: Headers): string | null {
  return (
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    hdrs.get("x-real-ip") ??
    null
  );
}

export async function revokeAllSessions(userId: string) {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
