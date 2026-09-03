import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import type {
  Analytics,
  CachedGame,
  CategoryWeights,
  LibraryEntry,
  LibraryQuery,
  PlayStatus,
  Profile,
  ReratePoolItem,
  SearchFilters,
  SearchOutcome,
  UiSettings,
} from "./types";

export const api = {
  getProfile: () => invoke<Profile | null>("get_profile"),
  createProfile: (username: string) => invoke<Profile>("create_profile", { username }),
  renameProfile: (username: string) => invoke<Profile>("rename_profile", { username }),
  updateWeights: (weights: CategoryWeights) => invoke<void>("update_weights", { weights }),

  searchGames: (query: string, opts?: { page?: number; filters?: SearchFilters }) =>
    invoke<SearchOutcome>("search_games", {
      query,
      page: opts?.page,
      filters: opts?.filters ?? null,
    }),
  libraryQuery: (query: LibraryQuery) => invoke<LibraryEntry[]>("library_query", { query }),
  addToLibrary: (game: CachedGame, status: PlayStatus) =>
    invoke<LibraryEntry>("add_to_library", { game, status }),
  updateLibraryEntry: (
    entryId: number,
    patch: Partial<{
      status: PlayStatus;
      favourite: boolean;
      playtimeMinutes: number;
      startedAt: string;
      finishedAt: string;
      notes: string;
    }>,
  ) => invoke<LibraryEntry>("update_library_entry", { entryId, patch }),
  removeLibraryEntry: (entryId: number) => invoke<void>("remove_from_library", { entryId }),
  getLibraryEntry: (entryId: number) => invoke<LibraryEntry>("get_library_entry", { entryId }),
  getGenresAndPlatforms: () =>
    invoke<{ genres: string[]; platforms: string[] }>("get_genres_and_platforms"),

  setStarRating: (entryId: number, stars: number | null) =>
    invoke<LibraryEntry>("set_star_rating", { entryId, stars }),
  startRerateSession: (statuses: PlayStatus[]) =>
    invoke<ReratePoolItem[]>("start_rerate_session", { statuses }),
  markRerated: (entryId: number) => invoke<void>("mark_rerated", { entryId }),
  setCategoryScores: (
    entryId: number,
    scores: {
      gameplay: number | null;
      story: number | null;
      music: number | null;
      technical: number | null;
    },
  ) => invoke<LibraryEntry>("set_category_scores", { entryId, scores }),

  getAnalytics: (mode?: "stars" | "detailed" | "both") =>
    invoke<Analytics>("get_analytics", { mode }),

  getApiKey: () => invoke<{ hasKey: boolean }>("get_api_key"),
  setApiKey: (key: string) => invoke<{ hasKey: boolean }>("set_api_key", { key }),

  getSettings: () => invoke<UiSettings>("get_settings"),
  setTheme: (theme: string) => invoke<UiSettings>("set_theme", { theme }),
  setCustomTheme: (base: string, accent: string) =>
    invoke<UiSettings>("set_custom_theme", { base, accent }),
  setExtendedSorting: (enabled: boolean) => invoke<UiSettings>("set_extended_sorting", { enabled }),

  cacheImage: (url: string) => invoke<string>("cache_image", { url }),
};

/** Resolve a cover URL to a locally cached file URL (offline-safe). */
export async function localCover(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const path = await api.cacheImage(url);
    return convertFileSrc(path);
  } catch {
    return url; // fall back to remote URL (online)
  }
}
