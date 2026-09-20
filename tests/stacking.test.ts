import { describe, expect, it } from "vitest";
import { pairKey, stackPlayers, type StackPlayer } from "@/lib/stacking";

function players(ratings: number[]): StackPlayer[] {
  return ratings.map((rating, index) => ({
    id: `p${index + 1}`,
    name: `Player ${index + 1}`,
    rating,
  }));
}

function spread(group: { players: StackPlayer[] }) {
  const ratings = group.players.map((p) => p.rating);
  return Math.max(...ratings) - Math.min(...ratings);
}

describe("stackPlayers", () => {
  it("seats exactly the number of players a court holds", () => {
    const result = stackPlayers(players([3, 3.5, 4, 4.5, 2.5, 3, 5, 3.5]), {
      courtCount: 2,
      playersPerCourt: 4,
    });

    expect(result.groups).toHaveLength(2);
    for (const group of result.groups) expect(group.players).toHaveLength(4);
    expect(result.bench).toHaveLength(0);
  });

  it("never exceeds total capacity and benches the overflow", () => {
    const result = stackPlayers(players([3, 3, 3, 3, 3, 3, 3, 3, 3, 3]), {
      courtCount: 2,
      playersPerCourt: 4,
    });

    expect(result.groups.flatMap((g) => g.players)).toHaveLength(8);
    expect(result.bench).toHaveLength(2);
  });

  it("handles an odd number of players without dropping anyone", () => {
    const input = players([2.5, 3, 3.5, 4, 4.5, 5, 3.25]);
    const result = stackPlayers(input, { courtCount: 2, playersPerCourt: 4 });

    const seated = result.groups.flatMap((g) => g.players.map((p) => p.id));
    const benched = result.bench.map((p) => p.id);
    expect([...seated, ...benched].sort()).toEqual(input.map((p) => p.id).sort());
  });

  it("assigns every player exactly once", () => {
    const input = players([2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 3, 3]);
    const result = stackPlayers(input, { courtCount: 2, playersPerCourt: 4 });

    const all = [...result.groups.flatMap((g) => g.players), ...result.bench].map((p) => p.id);
    expect(new Set(all).size).toBe(all.length);
  });

  it("keeps skill spread tight within each court", () => {
    // Two clearly separated bands. A balanced stacker should not mix them.
    const result = stackPlayers(players([2, 2.1, 2.2, 2.3, 5, 5.1, 5.2, 5.3]), {
      courtCount: 2,
      playersPerCourt: 4,
      historyWeight: 0,
    });

    for (const group of result.groups) {
      expect(spread(group)).toBeLessThan(1);
    }
  });

  it("reports an average rating per court", () => {
    const result = stackPlayers(players([3, 3, 4, 4]), {
      courtCount: 1,
      playersPerCourt: 4,
    });
    expect(result.groups[0].avgRating).toBeCloseTo(3.5, 5);
  });

  it("prefers new pairings when history says players have already played together", () => {
    const input = players([3, 3, 3, 3, 3, 3, 3, 3]);

    // p1–p2 and p3–p4 have played repeatedly. With all ratings identical the
    // only signal left is the history penalty, so they should be split up.
    const pairHistory: Record<string, number> = {
      [pairKey("p1", "p2")]: 6,
      [pairKey("p3", "p4")]: 6,
    };

    const withHistory = stackPlayers(input, {
      courtCount: 2,
      playersPerCourt: 4,
      pairHistory,
      historyWeight: 1,
    });
    const withoutHistory = stackPlayers(input, {
      courtCount: 2,
      playersPerCourt: 4,
      historyWeight: 1,
    });

    expect(withHistory.score).toBeLessThanOrEqual(withoutHistory.score + 1e-9);

    const together = (result: typeof withHistory, a: string, b: string) =>
      result.groups.some(
        (g) => g.players.some((p) => p.id === a) && g.players.some((p) => p.id === b),
      );

    expect(together(withHistory, "p1", "p2") && together(withHistory, "p3", "p4")).toBe(false);
  });

  it("returns everyone to the bench when there are no courts", () => {
    const input = players([3, 3, 3, 3]);
    const result = stackPlayers(input, { courtCount: 0, playersPerCourt: 4 });
    expect(result.groups).toHaveLength(0);
    expect(result.bench).toHaveLength(4);
  });

  it("handles an empty roster", () => {
    const result = stackPlayers([], { courtCount: 4, playersPerCourt: 4 });
    expect(result.groups.flatMap((g) => g.players)).toHaveLength(0);
    expect(result.bench).toHaveLength(0);
  });

  it("uses supplied court labels", () => {
    const result = stackPlayers(players([3, 3, 3, 3]), {
      courtCount: 1,
      playersPerCourt: 4,
      courtLabels: ["Court 1 — Center"],
    });
    expect(result.groups[0].label).toBe("Court 1 — Center");
  });

  it("is deterministic for the same input", () => {
    const input = players([2.5, 3, 3.5, 4, 4.5, 5, 3.25, 3.75]);
    const options = { courtCount: 2, playersPerCourt: 4 };
    const a = stackPlayers(input, options);
    const b = stackPlayers(input, options);

    expect(a.groups.map((g) => g.players.map((p) => p.id))).toEqual(
      b.groups.map((g) => g.players.map((p) => p.id)),
    );
  });
});

describe("pairKey", () => {
  it("is order independent", () => {
    expect(pairKey("a", "b")).toBe(pairKey("b", "a"));
  });
});
