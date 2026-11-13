import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const { overlaps, overlapWhere, matchWindow, hashCameraKey, newCameraKey, cameraKeyFromRequest, isOnline } =
  await import("@/lib/picklecam");
const { camIngestSchema } = await import("@/lib/validation");

const at = (hhmm: string) => new Date(`2026-11-13T${hhmm}:00+08:00`);
const slot = { courtId: "c1", startAt: at("18:00"), endAt: at("19:00"), kind: "booking" as const, label: "EZP-1", refId: "b1" };

describe("pickle cam access windows", () => {
  it("matches a clip on the same court during the slot", () => {
    expect(overlaps({ courtId: "c1", startAt: at("18:05"), endAt: at("18:55") }, slot)).toBe(true);
    expect(overlaps({ courtId: "c1", startAt: at("17:30"), endAt: at("18:10") }, slot)).toBe(true);
  });

  it("rejects another court, or a clip outside the slot", () => {
    expect(overlaps({ courtId: "c2", startAt: at("18:05"), endAt: at("18:55") }, slot)).toBe(false);
    expect(overlaps({ courtId: "c1", startAt: at("19:00"), endAt: at("20:00") }, slot)).toBe(false);
    expect(overlaps({ courtId: "c1", startAt: at("17:00"), endAt: at("18:00") }, slot)).toBe(false);
  });

  it("handles a clip still recording (no end) by its start", () => {
    expect(overlaps({ courtId: "c1", startAt: at("18:30"), endAt: null }, slot)).toBe(true);
    expect(overlaps({ courtId: "c1", startAt: at("17:59"), endAt: null }, slot)).toBe(false);
  });

  it("returns the matching game", () => {
    expect(matchWindow({ courtId: "c1", startAt: at("18:10"), endAt: at("18:20") }, [slot])?.label).toBe("EZP-1");
  });

  it("builds an empty filter when the player has no games", () => {
    expect(overlapWhere([])).toEqual({ id: { in: [] } });
  });
});

describe("camera keys", () => {
  it("only stores a hash and reads the key from either header", () => {
    const { key, hash, hint } = newCameraKey();
    expect(key.startsWith("ezcam_")).toBe(true);
    expect(hash).toBe(hashCameraKey(key));
    expect(hash).not.toContain(key);
    expect(key.endsWith(hint)).toBe(true);
    expect(cameraKeyFromRequest(new Request("http://x", { headers: { authorization: `Bearer ${key}` } }))).toBe(key);
    expect(cameraKeyFromRequest(new Request("http://x", { headers: { "x-camera-key": key } }))).toBe(key);
    expect(cameraKeyFromRequest(new Request("http://x"))).toBeNull();
  });

  it("marks a camera offline after a few quiet minutes", () => {
    const now = new Date();
    expect(isOnline(new Date(now.getTime() - 60_000), now)).toBe(true);
    expect(isOnline(new Date(now.getTime() - 10 * 60_000), now)).toBe(false);
    expect(isOnline(null, now)).toBe(false);
  });
});

describe("ingest payloads", () => {
  it("refuses non-http video links", () => {
    const bad = camIngestSchema.safeParse({
      event: "recording.completed",
      externalId: "x",
      startAt: "2026-11-13T18:00:00+08:00",
      endAt: "2026-11-13T19:00:00+08:00",
      videoUrl: "javascript:alert(1)",
    });
    expect(bad.success).toBe(false);
  });
});
