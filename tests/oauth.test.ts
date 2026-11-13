import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const db = {
  oAuthAccount: { findUnique: vi.fn(), create: vi.fn() },
  user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: db }));

process.env.GOOGLE_CLIENT_ID = "gid";
process.env.GOOGLE_CLIENT_SECRET = "gsecret";

const { safeNext, newState, authorizeUrl, enabledProviders, findOrCreateUser } = await import("@/lib/oauth");

const profile = {
  providerUserId: "g-123",
  email: "juan@example.com",
  emailVerified: true,
  fullName: "Juan dela Cruz",
  avatarUrl: null,
};

beforeEach(() => vi.clearAllMocks());

describe("social sign-in", () => {
  it("only allows same-site redirects after sign-in", () => {
    expect(safeNext("/book?court=1")).toBe("/book?court=1");
    expect(safeNext("//evil.com")).toBe("/dashboard");
    expect(safeNext("/\\evil.com")).toBe("/dashboard");
    expect(safeNext("https://evil.com")).toBe("/dashboard");
    expect(safeNext(null)).toBe("/dashboard");
  });

  it("shows only configured providers", () => {
    expect(enabledProviders()).toEqual(["google"]);
  });

  it("builds a Google URL with state, nonce and PKCE", () => {
    const s = newState("/book");
    const url = new URL(authorizeUrl("google", s));
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("state")).toBe(s.state);
    expect(url.searchParams.get("nonce")).toBe(s.nonce);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3000/api/auth/oauth/google/callback");
  });

  it("returns the already-linked user", async () => {
    db.oAuthAccount.findUnique.mockResolvedValue({ user: { id: "u1" } });
    expect(await findOrCreateUser("google", profile)).toEqual({ id: "u1" });
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it("links to an existing account with the same verified email", async () => {
    db.oAuthAccount.findUnique.mockResolvedValue(null);
    db.user.findUnique.mockResolvedValue({ id: "u2", avatarUrl: "x" });
    expect(await findOrCreateUser("google", profile)).toEqual({ id: "u2", avatarUrl: "x" });
    expect(db.oAuthAccount.create).toHaveBeenCalledWith({
      data: { userId: "u2", provider: "google", providerUserId: "g-123", email: "juan@example.com" },
    });
  });

  it("creates a new customer on first sign-in", async () => {
    db.oAuthAccount.findUnique.mockResolvedValue(null);
    db.user.findUnique.mockResolvedValue(null);
    db.user.create.mockResolvedValue({ id: "u3" });
    await findOrCreateUser("google", profile);
    const data = db.user.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ email: "juan@example.com", fullName: "Juan dela Cruz", role: "CUSTOMER" });
    expect(data.oauthAccounts.create.providerUserId).toBe("g-123");
  });

  it("refuses to link an unverified email", async () => {
    db.oAuthAccount.findUnique.mockResolvedValue(null);
    await expect(findOrCreateUser("facebook", { ...profile, emailVerified: false })).rejects.toThrow(/verified/);
    await expect(findOrCreateUser("facebook", { ...profile, email: null })).rejects.toThrow(/email/);
    expect(db.user.create).not.toHaveBeenCalled();
  });
});
