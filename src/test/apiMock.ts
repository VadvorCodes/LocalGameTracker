import { vi } from "vitest";

/**
 * Shared hoistable mock of `src/api`. Test files plug it in with:
 *
 *   vi.mock("<relative>/api", async () => {
 *     const m = await import("<relative>/test/apiMock");
 *     return { api: m.apiMock, localCover: m.localCoverMock };
 *   });
 *
 * `clearMocks` wipes call history between tests; return values are set per
 * test/beforeEach via mockResolvedValue.
 */
const NAMES = [
  "getProfile",
  "createProfile",
  "renameProfile",
  "updateWeights",
  "searchGames",
  "libraryQuery",
  "addToLibrary",
  "updateLibraryEntry",
  "removeLibraryEntry",
  "getLibraryEntry",
  "getGenresAndPlatforms",
  "setStarRating",
  "startRerateSession",
  "markRerated",
  "setCategoryScores",
  "getAnalytics",
  "getApiKey",
  "setApiKey",
  "getSettings",
  "setTheme",
  "setCustomTheme",
  "setExtendedSorting",
  "cacheImage",
] as const;

export const apiMock = Object.fromEntries(
  NAMES.map((n) => [n, vi.fn()]),
) as unknown as Record<(typeof NAMES)[number], ReturnType<typeof vi.fn>>;

export const localCoverMock = vi.fn();
