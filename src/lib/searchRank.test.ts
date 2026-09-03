import { describe, expect, it } from "vitest";
import type { CachedGame } from "../types";
import {
  PRESET_LABELS,
  RANK_PRESETS,
  deriveBreakpoints,
  popularityScore,
  rankGames,
  recencyScore,
  setDivider,
  textScore,
} from "./searchRank";

const NOW = new Date("2026-01-01T00:00:00Z");

function game(partial: Partial<CachedGame>): CachedGame {
  return {
    rawgId: 0,
    name: "",
    coverUrl: null,
    genres: [],
    platforms: [],
    releaseDate: null,
    developer: null,
    ...partial,
  };
}

describe("textScore", () => {
  it("scores exact, prefix, word-boundary, substring and token matches in order", () => {
    expect(textScore("Call of Duty", "Call of Duty")).toBe(1);
    expect(textScore("call of duty", "Call of Duty: Vanguard")).toBe(0.9);
    expect(textScore("vanguard", "Call of Duty: Vanguard")).toBe(0.75);
    expect(textScore("zelda", "Call of Duty")).toBe(0);
    expect(textScore("dern warf", "Modern Warfare")).toBe(0.5); // substring, not word-boundary
  });

  it("ignores case and collapsed whitespace", () => {
    expect(textScore("  CALL   of  duty ", "call of duty")).toBe(1);
  });

  it("does not match word-boundary inside another word", () => {
    expect(textScore("one", "Warzone")).toBe(0.5); // substring only, not a word
    expect(textScore("war", "God of War")).toBe(0.75);
  });

  it("overlaps tokens ignoring punctuation from subtitles", () => {
    expect(textScore("duty call", "Call of Duty: Vanguard")).toBeCloseTo(0.4, 10); // 2/2 tokens × 0.4
  });
});

describe("popularityScore", () => {
  it("is 0 for null/zero and 1 for the max of the set", () => {
    expect(popularityScore(null, 5000)).toBe(0);
    expect(popularityScore(0, 5000)).toBe(0);
    expect(popularityScore(5000, 5000)).toBe(1);
  });

  it("uses a log scale so mid-tier games stay visible", () => {
    const score = popularityScore(500, 5000);
    expect(score).toBeGreaterThan(0.6); // linear scaling would give 0.1
    expect(score).toBeLessThan(1);
  });
});

describe("recencyScore", () => {
  it("is 0 before the 1990 anchor and 1 in the current year", () => {
    expect(recencyScore("1985-01-01", NOW)).toBe(0);
    expect(recencyScore("2026-05-01", NOW)).toBe(1);
  });

  it("scales linearly in between and 0 when undated", () => {
    expect(recencyScore("2008-01-01", NOW)).toBeCloseTo(18 / 36, 10);
    expect(recencyScore(null, NOW)).toBe(0);
  });
});

describe("deriveBreakpoints / setDivider", () => {
  const balanced = RANK_PRESETS.balanced; // 45 / 30 / 25 → b1 = 45, b2 = 75

  it("derives the two breakpoints from the weights", () => {
    expect(deriveBreakpoints(balanced)).toEqual({ b1: 45, b2: 75 });
  });

  it("moving divider 0 trades only between name match and popularity", () => {
    const next = setDivider(balanced, 0, 20);
    expect(Math.round(next.text * 100)).toBe(20);
    expect(Math.round(next.popularity * 100)).toBe(55); // b2 stays at 75
    expect(Math.round(next.recency * 100)).toBe(25);
  });

  it("moving divider 1 trades only between popularity and recency", () => {
    const next = setDivider(balanced, 1, 90);
    expect(Math.round(next.text * 100)).toBe(45); // b1 stays at 45
    expect(Math.round(next.popularity * 100)).toBe(45);
    expect(Math.round(next.recency * 100)).toBe(10);
  });

  it("clamps against the neighbouring divider and never inverts", () => {
    const collapsed = setDivider(balanced, 0, 90); // beyond b2 = 75
    expect(deriveBreakpoints(collapsed)).toEqual({ b1: 75, b2: 75 });
    const uncrossed = setDivider(collapsed, 0, 10); // drag back across
    expect(deriveBreakpoints(uncrossed)).toEqual({ b1: 10, b2: 75 });
  });

  it("always sums to one full bar with no negative shares, even at extremes", () => {
    for (const x of [0, 50, 100]) {
      for (const divider of [0, 1] as const) {
        const next = setDivider(balanced, divider, x);
        const values = Object.values(next);
        expect(Math.round(values.reduce((a, b) => a + b, 0) * 100)).toBe(100);
        expect(values.every((v) => v >= 0)).toBe(true);
      }
    }
  });

  it("supports collapsing segments to zero and pulling them back out", () => {
    const allRecency = setDivider(setDivider(balanced, 0, 0), 1, 0); // 0 / 0 / 100
    expect(Math.round(allRecency.text * 100)).toBe(0);
    expect(Math.round(allRecency.popularity * 100)).toBe(0);
    expect(Math.round(allRecency.recency * 100)).toBe(100);
    const revived = setDivider(allRecency, 1, 50); // popularity comes back
    expect(deriveBreakpoints(revived)).toEqual({ b1: 0, b2: 50 });
  });

  it("round-trips the balanced defaults", () => {
    const moved = setDivider(setDivider(balanced, 0, 10), 1, 90);
    const restored = setDivider(setDivider(moved, 1, 75), 0, 45);
    expect(deriveBreakpoints(restored)).toEqual({ b1: 45, b2: 75 });
  });
});

describe("rankGames", () => {
  // The motivating case: RAWG's relevance order surfaced the 2003 original,
  // CoD Mobile, then Vanguard. Balanced weights should put the modern,
  // heavily-added entries on top while keeping the exact-match original visible.
  const callOfDutyGames: CachedGame[] = [
    game({ rawgId: 1, name: "Call of Duty", releaseDate: "2003-10-29", added: 1500 }),
    game({ rawgId: 2, name: "Call of Duty: Mobile", releaseDate: "2019-10-01", added: 900 }),
    game({ rawgId: 3, name: "Call of Duty: Vanguard", releaseDate: "2021-11-05", added: 2000 }),
    game({ rawgId: 4, name: "Call of Duty: Modern Warfare II", releaseDate: "2022-10-28", added: 5300 }),
  ];

  it("balanced weights rank the modern popular entry first, original last", () => {
    const order = rankGames(callOfDutyGames, "call of duty", RANK_PRESETS.balanced, NOW).map(
      (g) => g.name,
    );
    expect(order[0]).toBe("Call of Duty: Modern Warfare II");
    expect(order[order.length - 1]).toBe("Call of Duty");
  });

  it("best-match keeps the exact name match on top despite low popularity", () => {
    const order = rankGames(callOfDutyGames, "call of duty", RANK_PRESETS.bestMatch, NOW).map(
      (g) => g.name,
    );
    expect(order[0]).toBe("Call of Duty");
  });

  it("newest puts the most recent release first", () => {
    const order = rankGames(callOfDutyGames, "call of duty", RANK_PRESETS.newest, NOW).map(
      (g) => g.name,
    );
    expect(order[0]).toBe("Call of Duty: Modern Warfare II");
  });

  it("falls back to balanced when all weights are zero", () => {
    const zero = rankGames(callOfDutyGames, "call of duty", { text: 0, popularity: 0, recency: 0 }, NOW);
    const balanced = rankGames(callOfDutyGames, "call of duty", RANK_PRESETS.balanced, NOW);
    expect(zero.map((g) => g.rawgId)).toEqual(balanced.map((g) => g.rawgId));
  });

  it("renormalizes weights instead of penalizing small ones", () => {
    const doubled = rankGames(
      callOfDutyGames,
      "call of duty",
      { text: 0.9, popularity: 0.6, recency: 0.5 },
      NOW,
    );
    const halved = rankGames(
      callOfDutyGames,
      "call of duty",
      { text: 0.45, popularity: 0.3, recency: 0.25 },
      NOW,
    );
    expect(doubled.map((g) => g.rawgId)).toEqual(halved.map((g) => g.rawgId));
  });

  it("breaks score ties alphabetically and does not mutate the input", () => {
    const input = [
      game({ rawgId: 1, name: "Beta", added: 100, releaseDate: "2020-01-01" }),
      game({ rawgId: 2, name: "Alpha", added: 100, releaseDate: "2020-01-01" }),
    ];
    const original = [...input];
    const order = rankGames(input, "", RANK_PRESETS.balanced, NOW);
    expect(order.map((g) => g.name)).toEqual(["Alpha", "Beta"]);
    expect(input).toEqual(original);
  });

  it("ranks games with no popularity data by text + recency only (offline cache)", () => {
    const undated = [
      game({ rawgId: 1, name: "Portal", releaseDate: "2007-10-09" }),
      game({ rawgId: 2, name: "Portal 2", releaseDate: "2011-04-18" }),
    ];
    const newest = rankGames(undated, "portal", RANK_PRESETS.newest, NOW).map((g) => g.name);
    expect(newest[0]).toBe("Portal 2"); // no `added` on either, recency decides
    // And under balanced weights ranking still works without throwing,
    // with the exact name match winning on text.
    const balanced = rankGames(undated, "portal", RANK_PRESETS.balanced, NOW).map((g) => g.name);
    expect(balanced[0]).toBe("Portal");
  });

  it("exposes a label for every preset including custom", () => {
    for (const key of ["balanced", "bestMatch", "popular", "newest", "custom"] as const) {
      expect(PRESET_LABELS[key]).toBeTruthy();
    }
  });
});
