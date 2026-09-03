export type PlayStatus = "WantToPlay" | "Playing" | "Completed" | "Dropped";

export const STATUS_LABELS: Record<PlayStatus, string> = {
  WantToPlay: "Want to Play",
  Playing: "Playing",
  Completed: "Completed",
  Dropped: "Dropped",
};

/** Every play status in canonical order (filters, pickers, dropdowns). */
export const STATUSES: PlayStatus[] = ["WantToPlay", "Playing", "Completed", "Dropped"];

/**
 * Chip styling per status. Consumers style whole chips with
 * `${bg} ${text} ${border}`, or take `bg` alone for solid fills (dashboard bars).
 */
export const STATUS_COLORS: Record<PlayStatus, { bg: string; text: string; border: string }> = {
  WantToPlay: { bg: "bg-amber-500/15", text: "text-amber-300", border: "border-amber-500/30" },
  Playing: { bg: "bg-emerald-500/15", text: "text-emerald-300", border: "border-emerald-500/30" },
  Completed: { bg: "bg-sky-500/15", text: "text-sky-300", border: "border-sky-500/30" },
  Dropped: { bg: "bg-rose-500/15", text: "text-rose-300", border: "border-rose-500/30" },
};

export interface CategoryWeights {
  gameplay: number;
  story: number;
  music: number;
  technical: number;
}

/** Fallback weights when no profile exists yet (each category 25%). */
export const DEFAULT_WEIGHTS: CategoryWeights = {
  gameplay: 25,
  story: 25,
  music: 25,
  technical: 25,
};

/** The four scored categories with their display labels. */
export const CATEGORIES = [
  { key: "gameplay", label: "Gameplay" },
  { key: "story", label: "Storytelling" },
  { key: "music", label: "Music" },
  { key: "technical", label: "Technical Performance" },
] as const;

export type CategoryKey = (typeof CATEGORIES)[number]["key"];

/** Which ratings an analytics view includes. */
export type RatingMode = "stars" | "detailed" | "both";

export interface Profile {
  id: number;
  username: string;
  categoryWeights: CategoryWeights;
  createdAt: string;
}

/** User-picked colours for the custom theme (#rrggbb); shades are derived. */
export interface CustomThemeColours {
  base: string;
  accent: string;
}

/** Every theme id the app can persist: the preset ids plus "custom". */
export const THEME_IDS = [
  "midnight",
  "ocean",
  "forest",
  "sunset",
  "violet",
  "crimson",
  "custom",
] as const;

export type ThemeId = (typeof THEME_IDS)[number];

/** Runtime guard for theme ids read back from settings.json. */
export function isThemeId(v: unknown): v is ThemeId {
  return typeof v === "string" && (THEME_IDS as readonly string[]).includes(v);
}

/** UI preferences persisted in settings.json. */
export interface UiSettings {
  theme: ThemeId;
  customTheme: CustomThemeColours | null;
  /** Whether the Library sort menu also lists the extended sorts (the "Other" and "By category" groups). */
  extendedSorting: boolean;
}

export interface CachedGame {
  rawgId: number;
  name: string;
  coverUrl: string | null;
  genres: string[];
  platforms: string[];
  releaseDate: string | null;
  developer: string | null;
  /** RAWG "added" count (users who added the game) — the popularity signal for search ranking. */
  added?: number | null;
  metacritic?: number | null;
}

/** Server-side filters applied inside the RAWG query (full recall). */
export interface SearchFilters {
  fromYear?: number;
  toYear?: number;
  /** Exclude DLC, special editions and remasters (RAWG `exclude_additions`). */
  excludeAdditions?: boolean;
}

export interface LibraryEntry {
  id: number;
  rawgId: number;
  name: string;
  coverUrl: string | null;
  genres: string[];
  platforms: string[];
  releaseDate: string | null;
  developer: string | null;
  status: PlayStatus;
  favourite: boolean;
  playtimeMinutes: number;
  startedAt: string | null;
  finishedAt: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
  starRating: number | null;
  gameplay: number | null;
  story: number | null;
  music: number | null;
  technical: number | null;
  computedOverall: number | null;
  ratedAt: string | null;
  /** Re-rate cooldown tag ("Recently Rerated"); non-null while the game sits out a cycle. */
  reratedAt: string | null;
}

export interface LibraryQuery {
  search?: string;
  statuses?: PlayStatus[];
  favouritesOnly?: boolean;
  genres?: string[];
  platforms?: string[];
  minStars?: number;
  maxStars?: number;
  minScore?: number;
  maxScore?: number;
  sort?: string;
  sortDesc?: boolean;
}

export type SortKey =
  | "name"
  | "added"
  | "releaseDate"
  | "playtime"
  | "stars"
  | "score"
  | "gameplay"
  | "story"
  | "music"
  | "technical"
  | "ratedAt";

export const SORT_LABELS: Record<SortKey, string> = {
  name: "Name",
  added: "Date added",
  releaseDate: "Release date",
  playtime: "Playtime",
  stars: "Rating",
  score: "Detailed rating",
  gameplay: "Gameplay",
  story: "Story",
  music: "Music",
  technical: "Technical",
  ratedAt: "Date rated",
};

export interface SearchOutcome {
  games: CachedGame[];
  source: "live" | "cache";
}

export interface Analytics {
  totalGames: number;
  statusCounts: { status: string; count: number }[];
  favourites: number;
  totalPlaytimeMinutes: number;
  avgStars: number | null;
  avgOverall: number | null;
  categoryAverages: {
    gameplay: number | null;
    story: number | null;
    music: number | null;
    technical: number | null;
  };
  starDistribution: { x: number; y: number }[];
  scoreDistribution: { x: number; y: number }[];
  genreBreakdown: Breakdown[];
  platformBreakdown: Breakdown[];
  highestRated: MiniEntry[];
  lowestRated: MiniEntry[];
  recentlyRated: MiniEntry[];
  ratingTrend: {
    month: string;
    avgOverall: number | null;
    avgStars: number | null;
    count: number;
  }[];
  categoryTrend: {
    month: string;
    gameplay: number | null;
    story: number | null;
    music: number | null;
    technical: number | null;
  }[];
  firstVsRecent: {
    firstQuartile: CategoryAvgs;
    recentQuartile: CategoryAvgs;
  } | null;
  gutFeelingGames: MiniEntry[];
  onReflectionGames: MiniEntry[];
}

export interface Breakdown {
  label: string;
  count: number;
  avgStars: number | null;
  avgOverall: number | null;
  totalPlaytime: number;
}

export interface MiniEntry {
  entryId: number;
  name: string;
  coverUrl: string | null;
  stars: number | null;
  overall: number | null;
}

export interface CategoryAvgs {
  gameplay: number | null;
  story: number | null;
  music: number | null;
  technical: number | null;
}

/** One game in a re-rate cycle plus its closest genre matches from the library. */
export interface ReratePoolItem {
  entry: LibraryEntry;
  similar: LibraryEntry[];
}

/** What the user decided during the swipe phase of a re-rate cycle. */
export type RerateDecision = "rerate" | "keep";
