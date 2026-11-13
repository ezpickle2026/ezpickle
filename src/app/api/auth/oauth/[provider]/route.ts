import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { authorizeUrl, enabledProviders, isProvider, newState } from "@/lib/oauth";
import { clientIp } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { env, isProd } from "@/lib/env";
import { AppError } from "@/lib/errors";

export const dynamic = "force-dynamic";

const OAUTH_COOKIE = "ezp_oauth";

/** Starts social sign-in: remembers state in a short-lived cookie, then redirects. */
export async function GET(request: Request, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  const next = new URL(request.url).searchParams.get("next");

  if (!isProvider(provider) || !enabledProviders().includes(provider)) {
    return NextResponse.redirect(
      `${env.APP_URL}/login?error=${encodeURIComponent("That sign-in option isn't available yet.")}`,
    );
  }

  try {
    await rateLimit(`oauth:${clientIp(await headers()) ?? "unknown"}`, 20, 300);
  } catch (error) {
    if (!(error instanceof AppError) || error.code !== "rate_limited") throw error;
    return NextResponse.redirect(
      `${env.APP_URL}/login?error=${encodeURIComponent("Too many attempts. Please wait a few minutes.")}`,
    );
  }

  const state = newState(next ?? "/dashboard");
  const jar = await cookies();
  jar.set(OAUTH_COOKIE, JSON.stringify({ ...state, provider }), {
    httpOnly: true,
    // Apple returns with a cross-site POST, which only carries SameSite=None cookies.
    sameSite: isProd ? "none" : "lax",
    secure: isProd,
    path: "/api/auth/oauth",
    maxAge: 600,
  });

  return NextResponse.redirect(authorizeUrl(provider, state));
}
