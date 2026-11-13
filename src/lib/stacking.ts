/**
 * Open Play stacking.
 *
 * Pure function, no I/O — which is what makes it testable and swappable.
 * Goals, in priority order:
 *   1. Never exceed court capacity.
 *   2. Keep each court's skill spread tight (players enjoy even games).
 *   3. Avoid repeating pairings that already happened this session.
 *   4. Seat everyone; leftovers go to a clearly-labelled bench, never dropped.
 */

export type StackPlayer = {
  id: string;
  name: string;
  rating: number;
};

export type StackOptions = {
  courtCount: number;
  playersPerCourt: number;
  /** "id:id" -> times already paired. Sorted ids, colon separated. */
  pairHistory?: Record<string, number>;
  /** 0 = ignore history entirely, 1 = weigh it as heavily as skill. */
  historyWeight?: number;
  courtLabels?: string[];
};

export type StackResult = {
  groups: { label: string; courtIndex: number; players: StackPlayer[]; avgRating: number }[];
  bench: StackPlayer[];
  /** Lower is better. Sum of intra-court rating spread + repeat penalties. */
  score: number;
};

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export function stackPlayers(players: StackPlayer[], options: StackOptions): StackResult {
  const { courtCount, playersPerCourt } = options;
  const historyWeight = options.historyWeight ?? 0.35;
  const history = options.pairHistory ?? {};

  if (courtCount < 1 || playersPerCourt < 1) {
    return { groups: [], bench: [...players], score: 0 };
  }

  const capacity = courtCount * playersPerCourt;
  const sorted = [...players].sort((a, b) => b.rating - a.rating || a.id.localeCompare(b.id));

  // Overflow beyond total capacity sits out this round. Rotating the bench
  // across rounds is handled by the caller incrementing roundIndex.
  const seated = sorted.slice(0, capacity);
  const bench = sorted.slice(capacity);

  // Seed: contiguous skill bands. Players of similar level land together,
  // which is what actually makes the games competitive.
  const groups: StackPlayer[][] = Array.from({ length: courtCount }, () => []);
  const fullCourts = Math.floor(seated.length / playersPerCourt);
  const remainder = seated.length % playersPerCourt;

  let cursor = 0;
  for (let c = 0; c < courtCount; c++) {
    const size =
      c < fullCourts ? playersPerCourt : c === fullCourts && remainder > 0 ? remainder : 0;
    groups[c] = seated.slice(cursor, cursor + size);
    cursor += size;
  }

  // Refine: hill-climb by swapping players between courts whenever the swap
  // lowers the combined spread + repeat-pairing penalty. Converges in a
  // handful of passes for realistic session sizes (<= 64 players).
  let score = totalScore(groups, history, historyWeight);
  let improved = true;
  let passes = 0;

  while (improved && passes < 12) {
    improved = false;
    passes++;

    for (let g1 = 0; g1 < groups.length; g1++) {
      for (let g2 = g1 + 1; g2 < groups.length; g2++) {
        for (let i = 0; i < groups[g1].length; i++) {
          for (let j = 0; j < groups[g2].length; j++) {
            const tmp = groups[g1][i];
            groups[g1][i] = groups[g2][j];
            groups[g2][j] = tmp;

            const next = totalScore(groups, history, historyWeight);
            if (next < score - 1e-9) {
              score = next;
              improved = true;
            } else {
              const back = groups[g1][i];
              groups[g1][i] = groups[g2][j];
              groups[g2][j] = back;
            }
          }
        }
      }
    }
  }

  const labels = options.courtLabels ?? [];

  return {
    groups: groups
      .map((g, index) => ({
        label: labels[index] ?? `Court ${index + 1}`,
        courtIndex: index,
        players: [...g].sort((a, b) => b.rating - a.rating),
        avgRating: g.length ? round(g.reduce((s, p) => s + p.rating, 0) / g.length) : 0,
      }))
      .filter((g) => g.players.length > 0),
    bench,
    score: round(score),
  };
}

function totalScore(
  groups: StackPlayer[][],
  history: Record<string, number>,
  historyWeight: number,
): number {
  let score = 0;
  for (const group of groups) {
    if (group.length < 2) continue;

    const ratings = group.map((p) => p.rating);
    score += Math.max(...ratings) - Math.min(...ratings);

    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        score += (history[pairKey(group[i].id, group[j].id)] ?? 0) * historyWeight;
      }
    }
  }
  return score;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Splits one court's players into two sides. Snake order by rating
 * (A B B A A B B A …) so doubles pairs the strongest with the weakest:
 * [5.0, 4.0, 3.5, 3.0] -> A = 5.0 + 3.0, B = 4.0 + 3.5. Ties break on id so
 * every phone shows the same teams.
 */
export function splitTeams<T extends { id: string; rating: number }>(players: T[]): { teamA: T[]; teamB: T[] } {
  const sorted = [...players].sort((a, b) => b.rating - a.rating || a.id.localeCompare(b.id));
  const teamA: T[] = [];
  const teamB: T[] = [];
  sorted.forEach((player, index) => {
    (index % 4 === 0 || index % 4 === 3 ? teamA : teamB).push(player);
  });
  return { teamA, teamB };
}

/** Wins and losses for one player out of a session's recorded games. */
export function playerRecord(
  playerId: string,
  games: { teamA: string[]; teamB: string[]; scoreA: number; scoreB: number }[],
) {
  let wins = 0;
  let losses = 0;
  let pointsFor = 0;
  let pointsAgainst = 0;
  for (const g of games) {
    const onA = g.teamA.includes(playerId);
    const onB = g.teamB.includes(playerId);
    if (!onA && !onB) continue;
    const mine = onA ? g.scoreA : g.scoreB;
    const theirs = onA ? g.scoreB : g.scoreA;
    pointsFor += mine;
    pointsAgainst += theirs;
    if (mine > theirs) wins++;
    else losses++;
  }
  return { wins, losses, played: wins + losses, pointsFor, pointsAgainst };
}
