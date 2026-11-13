import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeCode, findOrCreateUser, isProvider, safeNext, type OAuthState } from "@/lib/oauth";
import { createSession } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

const OAUTH_COOKIE = "ezp_oauth";

type Params = { params: Promise<{ provider: string }> };

function toLogin(message: string, next?: string) {
  const u = new URL(`${env.APP_URL}/login`);
  u.searchParams.set("error", message);
  if (next && next !== "/dashboard") u.searchParams.set("next", next);
  // 303 turns Apple's POST into a normal GET of the login page.
  return NextResponse.redirect(u, 303);
}

async function finish(provider: string, fields: URLSearchParams | FormData) {
  const get = (k: string) => {
    const v = fields.get(k);
    return typeof v === "string" ? v : null;
  };

  const jar = await cookies();
  const raw = jar.get(OAUTH_COOKIE)?.value;
  jar.delete({ name: OAUTH_COOKIE, path: "/api/auth/oauth" });

  let saved: (OAuthState & { provider: string }) | null = null;
  try {
    saved = raw ? JSON.parse(raw) : null;
  } catch {
    saved = null;
  }
  const next = safeNext(saved?.next);

  if (get("error")) {
    // The person pressed Cancel on the provider's screen.
    return toLogin("Sign-in was cancelled.", next);
  }
  if (!isProvider(provider) || !saved || saved.provider !== provider || saved.state !== get("state")) {
    return toLogin("Your sign-in expired. Please try again.", next);
  }
  const code = get("code");
  if (!code) return toLogin("Sign-in failed. Please try again.", next);

  try {
    const profile = await exchangeCode(provider, code, saved, get("user"));
    const user = await findOrCreateUser(provider, profile);
    if (user.deletedAt || user.status !== "ACTIVE") {
      return toLogin("This account has been disabled.", next);
    }
    await createSession(user.id);
    const destination = next === "/dashboard" && user.role !== "CUSTOMER" ? "/admin" : next;
    return NextResponse.redirect(`${env.APP_URL}${destination}`, 303);
  } catch (error) {
    if (error instanceof AppError) return toLogin(error.message, next);
    console.error("[oauth] callback", error);
    return toLogin("Sign-in failed. Please try again.", next);
  }
}

export async function GET(request: Request, ctx: Params) {
  const { provider } = await ctx.params;
  return finish(provider, new URL(request.url).searchParams);
}

/** Apple uses response_mode=form_post. */
export async function POST(request: Request, ctx: Params) {
  const { provider } = await ctx.params;
  return finish(provider, await request.formData());
}
