import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  convertFileSrc: vi.fn((path: string) => `asset://localhost/${path}`),
}));

import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { api, localCover } from "./api";

const invokeMock = vi.mocked(invoke);
const convertMock = vi.mocked(convertFileSrc);

const game = {
  rawgId: 42,
  name: "Hollow Knight",
  coverUrl: "https://example.com/cover.jpg",
  genres: ["Metroidvania"],
  platforms: ["PC"],
  releaseDate: "2017-02-24",
  developer: "Team Cherry",
};

beforeEach(() => {
  invokeMock.mockReset();
});

describe("api wrappers", () => {
  it("get_profile / create_profile / rename_profile", async () => {
    invokeMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 1 })
      .mockResolvedValueOnce({ id: 1, username: "new" });
    expect(await api.getProfile()).toBeNull();
    await api.createProfile("alice");
    await api.renameProfile("bob");
    expect(invokeMock).toHaveBeenNthCalledWith(1, "get_profile");
    expect(invokeMock).toHaveBeenNthCalledWith(2, "create_profile", { username: "alice" });
    expect(invokeMock).toHaveBeenNthCalledWith(3, "rename_profile", { username: "bob" });
  });

  it("update_weights", async () => {
    const weights = { gameplay: 40, story: 30, music: 20, technical: 10 };
    await api.updateWeights(weights);
    expect(invokeMock).toHaveBeenCalledWith("update_weights", { weights });
  });

  it("search_games forwards query, optional page and filters", async () => {
    invokeMock.mockResolvedValue({ games: [], source: "live" });
    await api.searchGames("hollow");
    expect(invokeMock).toHaveBeenCalledWith("search_games", {
      query: "hollow",
      page: undefined,
      filters: null,
    });
    await api.searchGames("hollow", { page: 3 });
    expect(invokeMock).toHaveBeenLastCalledWith("search_games", {
      query: "hollow",
      page: 3,
      filters: null,
    });
    await api.searchGames("hollow", { filters: { fromYear: 2015, excludeAdditions: true } });
    expect(invokeMock).toHaveBeenLastCalledWith("search_games", {
      query: "hollow",
      page: undefined,
      filters: { fromYear: 2015, excludeAdditions: true },
    });
  });

  it("library_query", async () => {
    invokeMock.mockResolvedValueOnce([]);
    const query = { statuses: ["Playing" as const], favouritesOnly: true, minStars: 3 };
    await api.libraryQuery(query);
    expect(invokeMock).toHaveBeenCalledWith("library_query", { query });
  });

  it("add_to_library / update_library_entry / remove_from_library / get_library_entry", async () => {
    invokeMock.mockResolvedValue({});
    await api.addToLibrary(game, "Playing");
    expect(invokeMock).toHaveBeenCalledWith("add_to_library", { game, status: "Playing" });

    await api.updateLibraryEntry(7, { favourite: true, notes: "hi" });
    expect(invokeMock).toHaveBeenCalledWith("update_library_entry", {
      entryId: 7,
      patch: { favourite: true, notes: "hi" },
    });

    await api.removeLibraryEntry(7);
    expect(invokeMock).toHaveBeenCalledWith("remove_from_library", { entryId: 7 });

    await api.getLibraryEntry(7);
    expect(invokeMock).toHaveBeenCalledWith("get_library_entry", { entryId: 7 });
  });

  it("get_genres_and_platforms", async () => {
    invokeMock.mockResolvedValueOnce({ genres: ["RPG"], platforms: ["PC"] });
    expect(await api.getGenresAndPlatforms()).toEqual({ genres: ["RPG"], platforms: ["PC"] });
    expect(invokeMock).toHaveBeenCalledWith("get_genres_and_platforms");
  });

  it("set_star_rating accepts numbers and null", async () => {
    invokeMock.mockResolvedValue({});
    await api.setStarRating(7, 4.5);
    expect(invokeMock).toHaveBeenCalledWith("set_star_rating", { entryId: 7, stars: 4.5 });
    await api.setStarRating(7, null);
    expect(invokeMock).toHaveBeenLastCalledWith("set_star_rating", { entryId: 7, stars: null });
  });

  it("rerate session commands", async () => {
    invokeMock.mockResolvedValue([]);
    await api.startRerateSession(["Completed", "Dropped"], 10);
    expect(invokeMock).toHaveBeenCalledWith("start_rerate_session", {
      statuses: ["Completed", "Dropped"],
      cycleSize: "10",
    });
    await api.startRerateSession(["Completed", "Dropped"], "full");
    expect(invokeMock).toHaveBeenLastCalledWith("start_rerate_session", {
      statuses: ["Completed", "Dropped"],
      cycleSize: "full",
    });
    await api.markRerated(12);
    expect(invokeMock).toHaveBeenCalledWith("mark_rerated", { entryId: 12 });
  });

  it("set_category_scores", async () => {
    invokeMock.mockResolvedValue({});
    const scores = { gameplay: 80, story: null, music: 60, technical: 70 };
    await api.setCategoryScores(9, scores);
    expect(invokeMock).toHaveBeenCalledWith("set_category_scores", { entryId: 9, scores });
  });

  it("get_analytics forwards the optional mode", async () => {
    invokeMock.mockResolvedValue({});
    await api.getAnalytics();
    expect(invokeMock).toHaveBeenCalledWith("get_analytics", { mode: undefined });
    await api.getAnalytics("stars");
    expect(invokeMock).toHaveBeenLastCalledWith("get_analytics", { mode: "stars" });
  });

  it("api key status: empty string clears the key", async () => {
    invokeMock.mockResolvedValue({ hasKey: true }).mockResolvedValueOnce({ hasKey: false });
    await api.setApiKey("secret");
    expect(invokeMock).toHaveBeenNthCalledWith(1, "set_api_key", { key: "secret" });
    await api.setApiKey("");
    expect(invokeMock).toHaveBeenLastCalledWith("set_api_key", { key: "" });
  });

  it("get_api_key", async () => {
    invokeMock.mockResolvedValueOnce({ hasKey: false });
    expect(await api.getApiKey()).toEqual({ hasKey: false });
    expect(invokeMock).toHaveBeenCalledWith("get_api_key");
  });

  it("settings commands", async () => {
    invokeMock.mockResolvedValue({});
    await api.getSettings();
    expect(invokeMock).toHaveBeenCalledWith("get_settings");
    await api.setTheme("ocean");
    expect(invokeMock).toHaveBeenCalledWith("set_theme", { theme: "ocean" });
    await api.setCustomTheme("#0b0e14", "#5b7cfa");
    expect(invokeMock).toHaveBeenCalledWith("set_custom_theme", {
      base: "#0b0e14",
      accent: "#5b7cfa",
    });
    await api.setExtendedSorting(true);
    expect(invokeMock).toHaveBeenCalledWith("set_extended_sorting", { enabled: true });
  });

  it("cache_image", async () => {
    invokeMock.mockResolvedValueOnce("/cache/x.jpg");
    await api.cacheImage("https://example.com/x.jpg");
    expect(invokeMock).toHaveBeenCalledWith("cache_image", { url: "https://example.com/x.jpg" });
  });
});

describe("localCover", () => {
  it("resolves null to null without calling the backend", async () => {
    expect(await localCover(null)).toBeNull();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("maps a cached path through convertFileSrc", async () => {
    invokeMock.mockResolvedValueOnce("C:\\cache\\img.jpg");
    expect(await localCover("https://example.com/c.jpg")).toBe(
      "asset://localhost/C:\\cache\\img.jpg",
    );
    expect(convertMock).toHaveBeenCalledWith("C:\\cache\\img.jpg");
  });

  it("falls back to the remote URL when caching fails", async () => {
    invokeMock.mockRejectedValueOnce(new Error("offline"));
    expect(await localCover("https://example.com/c.jpg")).toBe("https://example.com/c.jpg");
  });
});
