import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, SignJWT, importPKCS8 } from "jose";
import { prisma } from "./prisma";
import { hashPassword } from "./password";
import { env } from "./env";
import { AppError } from "./errors";

/**
 * Social sign-in (Google, Facebook, Apple) using the plain OAuth 2.0 / OpenID
 * Connect authorization-code flow. No extra dependencies: `jose` verifies the
 * ID tokens against each provider's published keys.
 */

export type Provider = "google" | "facebook" | "apple";
export const PROVIDERS: Provider[] = ["google", "facebook", "apple"];

export function isProvider(value: string): value is Provider {
  return (PROVIDERS as string[]).includes(value);
}

export function enabledProviders(): Provider[] {
  return PROVIDERS.filter((p) => {
    if (p === "google") return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
    if (p === "facebook") return Boolean(env.FACEBOOK_APP_ID && env.FACEBOOK_APP_SECRET);
    return Boolean(env.APPLE_CLIENT_ID && env.APPLE_TEAM_ID && env.APPLE_KEY_ID && env.APPLE_PRIVATE_KEY);
  });
}

export function callbackUrl(provider: Provider) {
  return `${env.APP_URL}/api/auth/oauth/${provider}/callback`;
}

/** Only same-site paths, so `next` can never send someone to another domain. */
export function safeNext(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return "/dashboard";
  }
  return value;
}

export type OAuthState = { state: string; nonce: string; verifier: string; next: string };

export function newState(next: string): OAuthState {
  return {
    state: randomBytes(24).toString("base64url"),
    nonce: randomBytes(24).toString("base64url"),
    verifier: randomBytes(48).toString("base64url"),
    next: safeNext(next),
  };
}

const challenge = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

export function authorizeUrl(provider: Provider, s: OAuthState): string {
  const redirect = callbackUrl(provider);
  if (provider === "google") {
    const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    u.search = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: redirect,
      response_type: "code",
      scope: "openid email profile",
      state: s.state,
      nonce: s.nonce,
      code_challenge: challenge(s.verifier),
      code_challenge_method: "S256",
      prompt: "select_account",
    }).toString();
    return u.toString();
  }
  if (provider === "facebook") {
    const u = new URL("https://www.facebook.com/v19.0/dialog/oauth");
    u.search = new URLSearchParams({
      client_id: env.FACEBOOK_APP_ID,
      redirect_uri: redirect,
      response_type: "code",
      scope: "email,public_profile",
      state: s.state,
      code_challenge: challenge(s.verifier),
      code_challenge_method: "S256",
    }).toString();
    return u.toString();
  }
  // Apple posts the result back as a form when name/email are requested.
  const u = new URL("https://appleid.apple.com/auth/authorize");
  u.search = new URLSearchParams({
    client_id: env.APPLE_CLIENT_ID,
    redirect_uri: redirect,
    response_type: "code",
    response_mode: "form_post",
    scope: "name email",
    state: s.state,
    nonce: s.nonce,
  }).toString();
  return u.toString();
}

export type Profile = {
  providerUserId: string;
  email: string | null;
  emailVerified: boolean;
  fullName: string | null;
  avatarUrl: string | null;
};

const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const appleKeys = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));

async function postForm(url: string, body: Record<string, string>) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    console.error("[oauth] token exchange failed", url, res.status, json);
    throw new AppError("Sign-in failed. Please try again.", 400, "oauth_failed");
  }
  return json;
}

async function appleClientSecret() {
  const key = await importPKCS8(env.APPLE_PRIVATE_KEY, "ES256");
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: env.APPLE_KEY_ID })
    .setIssuer(env.APPLE_TEAM_ID)
    .setSubject(env.APPLE_CLIENT_ID)
    .setAudience("https://appleid.apple.com")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(key);
}

/** Swaps the authorization code for the user's verified profile. */
export async function exchangeCode(
  provider: Provider,
  code: string,
  s: OAuthState,
  appleUser?: string | null,
): Promise<Profile> {
  const redirect = callbackUrl(provider);

  if (provider === "google") {
    const tokens = await postForm("https://oauth2.googleapis.com/token", {
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirect,
      grant_type: "authorization_code",
      code_verifier: s.verifier,
    });
    const { payload } = await jwtVerify(String(tokens.id_token), googleKeys, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: env.GOOGLE_CLIENT_ID,
    });
    if (payload.nonce !== s.nonce) throw new AppError("Sign-in expired. Please try again.", 400, "oauth_state");
    return {
      providerUserId: String(payload.sub),
      email: typeof payload.email === "string" ? payload.email.toLowerCase() : null,
      emailVerified: payload.email_verified === true,
      fullName: typeof payload.name === "string" ? payload.name : null,
      avatarUrl: typeof payload.picture === "string" ? payload.picture : null,
    };
  }

  if (provider === "facebook") {
    const tokens = await postForm("https://graph.facebook.com/v19.0/oauth/access_token", {
      code,
      client_id: env.FACEBOOK_APP_ID,
      client_secret: env.FACEBOOK_APP_SECRET,
      redirect_uri: redirect,
      code_verifier: s.verifier,
    });
    const token = String(tokens.access_token);
    const appsecretProof = createHmac("sha256", env.FACEBOOK_APP_SECRET)
      .update(token)
      .digest("hex");
    const me = new URL("https://graph.facebook.com/v19.0/me");
    me.search = new URLSearchParams({
      fields: "id,name,email,picture.type(large)",
      access_token: token,
      appsecret_proof: appsecretProof,
    }).toString();
    const res = await fetch(me);
    const data = (await res.json().catch(() => ({}))) as {
      id?: string;
      name?: string;
      email?: string;
      picture?: { data?: { url?: string; is_silhouette?: boolean } };
    };
    if (!res.ok || !data.id) {
      console.error("[oauth] facebook profile failed", res.status, data);
      throw new AppError("Sign-in failed. Please try again.", 400, "oauth_failed");
    }
    const pic = data.picture?.data;
    return {
      providerUserId: data.id,
      email: data.email?.toLowerCase() ?? null,
      // Facebook only returns an email the person has confirmed.
      emailVerified: Boolean(data.email),
      fullName: data.name ?? null,
      avatarUrl: pic?.url && !pic.is_silhouette ? pic.url : null,
    };
  }

  const tokens = await postForm("https://appleid.apple.com/auth/token", {
    code,
    client_id: env.APPLE_CLIENT_ID,
    client_secret: await appleClientSecret(),
    redirect_uri: redirect,
    grant_type: "authorization_code",
  });
  const { payload } = await jwtVerify(String(tokens.id_token), appleKeys, {
    issuer: "https://appleid.apple.com",
    audience: env.APPLE_CLIENT_ID,
  });
  if (payload.nonce !== s.nonce) throw new AppError("Sign-in expired. Please try again.", 400, "oauth_state");

  // Apple sends the name only on the very first sign-in, outside the token.
  let fullName: string | null = null;
  if (appleUser) {
    try {
      const u = JSON.parse(appleUser) as { name?: { firstName?: string; lastName?: string } };
      fullName = [u.name?.firstName, u.name?.lastName].filter(Boolean).join(" ") || null;
    } catch {
      /* ignore malformed */
    }
  }
  return {
    providerUserId: String(payload.sub),
    email: typeof payload.email === "string" ? payload.email.toLowerCase() : null,
    emailVerified: payload.email_verified === true || payload.email_verified === "true",
    fullName,
    avatarUrl: null,
  };
}

/**
 * Finds the user for this provider account, links it to an existing account
 * with the same verified email, or creates a new customer account.
 */
export async function findOrCreateUser(provider: Provider, profile: Profile) {
  const linked = await prisma.oAuthAccount.findUnique({
    where: { provider_providerUserId: { provider, providerUserId: profile.providerUserId } },
    include: { user: true },
  });
  if (linked) return linked.user;

  if (!profile.email) {
    throw new AppError(
      "We couldn't get your email address. Please allow email access, or sign up with email instead.",
      400,
      "oauth_no_email",
    );
  }
  if (!profile.emailVerified) {
    throw new AppError(
      "Your email isn't verified with that account. Please sign up with email instead.",
      400,
      "oauth_unverified",
    );
  }

  const existing = await prisma.user.findUnique({ where: { email: profile.email } });
  if (existing) {
    await prisma.oAuthAccount.create({
      data: { userId: existing.id, provider, providerUserId: profile.providerUserId, email: profile.email },
    });
    if (!existing.avatarUrl && profile.avatarUrl) {
      await prisma.user.update({ where: { id: existing.id }, data: { avatarUrl: profile.avatarUrl } });
    }
    return existing;
  }

  return prisma.user.create({
    data: {
      email: profile.email,
      fullName: profile.fullName?.slice(0, 120) || profile.email.split("@")[0],
      avatarUrl: profile.avatarUrl,
      // Social accounts have no password; this random one can never be guessed.
      passwordHash: await hashPassword(randomBytes(32).toString("hex")),
      role: "CUSTOMER",
      oauthAccounts: {
        create: { provider, providerUserId: profile.providerUserId, email: profile.email },
      },
    },
  });
}
