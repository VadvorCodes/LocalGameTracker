import type { CachedGame } from "../types";

/** Relative importance of each ranking signal, 0..1 each; renormalized on use. */
export interface RankWeights {
  text: number;
  popularity: number;
  recency: number;
}

export type RankPreset = "balanced" | "bestMatch" | "popular" | "newest" | "custom";

export type WeightKey = keyof RankWeights;

/** Clamp a percent (0..100) into [lo, hi] — not the 0..1 score `clamp` below. */
function clampPct(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * The mix bar's state is two breakpoints on a 0..100 line: name match owns
 * [0, b1], popularity (b1, b2], recency (b2, 100]. Deriving the weights this
 * way means the three shares always sum to exactly 100% and can never go
 * negative, no matter where a divider is dragged.
 */
export function deriveBreakpoints(weights: RankWeights): { b1: number; b2: number } {
  const b1 = clampPct(Math.round(weights.text * 100), 0, 100);
  const b2 = clampPct(Math.round((weights.text + weights.popularity) * 100), b1, 100);
  return { b1, b2 };
}

/** Move divider 0 (Name match | Popularity) or 1 (Popularity | Recency) to `percentX`. */
export function setDivider(weights: RankWeights, divider: 0 | 1, percentX: number): RankWeights {
  const { b1, b2 } = deriveBreakpoints(weights);
  const x = clampPct(Math.round(percentX), 0, 100);
  const n1 = divider === 0 ? clampPct(x, 0, b2) : b1;
  const n2 = divider === 1 ? clampPct(x, b1, 100) : b2;
  return { text: n1 / 100, popularity: (n2 - n1) / 100, recency: (100 - n2) / 100 };
}

export const RANK_PRESETS: Record<Exclude<RankPreset, "custom">, RankWeights> = {
  balanced: { text: 0.45, popularity: 0.3, recency: 0.25 },
  bestMatch: { text: 0.85, popularity: 0.1, recency: 0.05 },
  popular: { text: 0.15, popularity: 0.7, recency: 0.15 },
  newest: { text: 0.15, popularity: 0.1, recency: 0.75 },
};

export const PRESET_LABELS: Record<RankPreset, string> = {
  balanced: "Balanced",
  bestMatch: "Best match",
  popular: "Popular",
  newest: "Newest",
  custom: "Custom",
};

/** Anchor year for the linear recency scale — older games score 0. */
const RECENCY_ANCHOR_YEAR = 1990;

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

/** How closely the game's name matches the query: 1 = exact, 0 = unrelated. */
export function textScore(query: string, name: string): number {
  const q = normalize(query);
  const n = normalize(name);
  if (!q || !n) return 0;
  if (n === q) return 1;
  if (n.startsWith(q)) return 0.9;
  // Word-boundary contains ("vanguard" matches "Call of Duty: Vanguard").
  if (new RegExp(`(^|[^a-z0-9])${escapeRegex(q)}([^a-z0-9]|$)`).test(n)) return 0.75;
  if (n.includes(q)) return 0.5;
  const qTokens = tokenize(q);
  const nTokens = new Set(tokenize(n));
  let hits = 0;
  for (const t of qTokens) if (nTokens.has(t)) hits++;
  return qTokens.length ? (hits / qTokens.length) * 0.4 : 0;
}

/** Lowercase, whitespace-collapsed word tokens with punctuation stripped
 * ("duty:" → "duty") so token overlap isn't defeated by subtitle colons. */
function tokenize(s: string): string[] {
  return s
    .split(" ")
    .map((t) => t.replace(/[^a-z0-9]/g, ""))
    .filter(Boolean);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Popularity 0..1 on a log scale — RAWG "added" counts span orders of
 * magnitude, so linear scaling would collapse everything below the top hit.
 * Normalized against the most-added game in the current result set.
 */
export function popularityScore(added: number | null | undefined, maxAdded: number): number {
  if (!added || maxAdded <= 0) return 0;
  return clamp(Math.log1p(added) / Math.log1p(maxAdded));
}

/** Recency 0..1, linear from the anchor year to `now`; undated games score 0. */
export function recencyScore(releaseDate: string | null, now = new Date()): number {
  if (!releaseDate) return 0;
  const year = Number(releaseDate.slice(0, 4));
  if (!Number.isFinite(year)) return 0;
  const span = now.getFullYear() - RECENCY_ANCHOR_YEAR;
  return clamp((year - RECENCY_ANCHOR_YEAR) / span);
}

function clamp(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/**
 * Re-rank a RAWG result set by the weighted blend of name match, popularity
 * and recency. RAWG's relevance order only generates the candidate pool; this
 * decides what the user actually sees. Ties break alphabetically so the order
 * is deterministic.
 */
export function rankGames(
  games: CachedGame[],
  query: string,
  weights: RankWeights,
  now = new Date(),
): CachedGame[] {
  const w = normalizeWeights(weights);
  const maxAdded = games.reduce((m, g) => Math.max(m, g.added ?? 0), 0);
  return [...games]
    .map((game) => {
      const score =
        w.text * textScore(query, game.name) +
        w.popularity * popularityScore(game.added, maxAdded) +
        w.recency * recencyScore(game.releaseDate, now);
      return { game, score };
    })
    .sort((a, b) => b.score - a.score || a.game.name.localeCompare(b.game.name))
    .map((r) => r.game);
}

function normalizeWeights(w: RankWeights): RankWeights {
  const total = w.text + w.popularity + w.recency;
  if (total <= 0) return RANK_PRESETS.balanced;
  return { text: w.text / total, popularity: w.popularity / total, recency: w.recency / total };
}
