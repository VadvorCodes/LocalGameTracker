import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("../api", async () => {
  const m = await import("../test/apiMock");
  return { api: m.apiMock, localCover: m.localCoverMock };
});

import { apiMock, localCoverMock } from "../test/apiMock";
import { useApp } from "../store";
import Search from "./Search";
import type { CachedGame, SearchOutcome } from "../types";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function game(overrides: Partial<CachedGame> = {}): CachedGame {
  return {
    rawgId: 1,
    name: "Halo",
    coverUrl: null,
    genres: ["Shooter", "Sci-Fi"],
    platforms: ["Xbox"],
    releaseDate: "2001-11-15",
    developer: "Bungie",
    ...overrides,
  };
}

function flushMicrotasks() {
  return act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

/** Search navigates on add, so mount it under routes with a probe target. */
function renderSearch() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<Search />} />
        <Route path="/game/:id" element={<div>detail-page</div>} />
        <Route path="/library" element={<div>library-page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

/** The server-side filter payload sent with a default (untouched) filter bar. */
const DEFAULT_FILTERS = {
  filters: { fromYear: undefined, toYear: undefined, excludeAdditions: true },
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  localCoverMock.mockResolvedValue(null);
  apiMock.libraryQuery.mockResolvedValue([]);
  useApp.setState({ profile: null, profileLoading: false, hasApiKey: true });
});

afterEach(() => {
  vi.useRealTimers();
});

function typeQuery(value: string) {
  fireEvent.change(screen.getByPlaceholderText("Search for a game…"), {
    target: { value },
  });
}

/** Type and run the debounced search to completion. */
async function searchFor(value: string, outcome: SearchOutcome) {
  const d = deferred<SearchOutcome>();
  apiMock.searchGames.mockReturnValueOnce(d.promise);
  typeQuery(value);
  act(() => vi.advanceTimersByTime(350));
  expect(screen.getByText("searching…")).toBeInTheDocument();
  await act(async () => {
    d.resolve(outcome);
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("Search — debouncing", () => {
  it("waits 350ms of idle before searching", async () => {
    renderSearch();
    typeQuery("hal");
    act(() => vi.advanceTimersByTime(349));
    expect(apiMock.searchGames).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(apiMock.searchGames).toHaveBeenCalledWith("hal", DEFAULT_FILTERS);
    await flushMicrotasks();
  });

  it("restarts the timer on every keystroke and searches once with the final query", async () => {
    renderSearch();
    typeQuery("h");
    act(() => vi.advanceTimersByTime(200));
    typeQuery("ha");
    act(() => vi.advanceTimersByTime(200));
    typeQuery("halo");
    act(() => vi.advanceTimersByTime(349));
    expect(apiMock.searchGames).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(apiMock.searchGames).toHaveBeenCalledTimes(1);
    expect(apiMock.searchGames).toHaveBeenCalledWith("halo", DEFAULT_FILTERS);
    await flushMicrotasks();
  });

  it("clears results immediately when the query becomes empty, without searching", async () => {
    renderSearch();
    await searchFor("halo", { games: [game()], source: "live" });
    expect(screen.getByTitle("Halo")).toBeInTheDocument();

    typeQuery("   ");
    expect(screen.queryByTitle("Halo")).toBeNull();
    act(() => vi.advanceTimersByTime(1000));
    expect(apiMock.searchGames).toHaveBeenCalledTimes(1); // no search for whitespace
  });
});

describe("Search — response races", () => {
  it("keeps the newest query's results when an older response lands last", async () => {
    renderSearch();
    const slow = deferred<SearchOutcome>();
    const fast = deferred<SearchOutcome>();
    apiMock.searchGames.mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise);

    typeQuery("hal");
    act(() => vi.advanceTimersByTime(350));
    typeQuery("halo");
    act(() => vi.advanceTimersByTime(350));

    await act(async () => {
      fast.resolve({ games: [game({ rawgId: 2, name: "Halo Reach" })], source: "live" });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByTitle("Halo Reach")).toBeInTheDocument();

    // the stale "hal" response arrives last — it must not clobber "halo"
    await act(async () => {
      slow.resolve({ games: [game({ rawgId: 1, name: "Halo CE" })], source: "live" });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.queryByTitle("Halo CE")).toBeNull();
    expect(screen.getByTitle("Halo Reach")).toBeInTheDocument();
  });

  it("keeps showing 'searching…' while the newest request is still pending", async () => {
    renderSearch();
    const slow = deferred<SearchOutcome>();
    const fast = deferred<SearchOutcome>();
    apiMock.searchGames.mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise);

    typeQuery("hal");
    act(() => vi.advanceTimersByTime(350));
    typeQuery("halo");
    act(() => vi.advanceTimersByTime(350));

    await act(async () => {
      slow.resolve({ games: [game({ rawgId: 1, name: "Halo CE" })], source: "live" });
      await Promise.resolve();
      await Promise.resolve();
    });
    // the stale response settled, but "halo" is still in flight
    expect(screen.getByText("searching…")).toBeInTheDocument();
  });

  it("does not surface a stale error after a newer search started", async () => {
    renderSearch();
    const slow = deferred<SearchOutcome>();
    apiMock.searchGames.mockReturnValueOnce(slow.promise);
    typeQuery("hal");
    act(() => vi.advanceTimersByTime(350));

    const ok = deferred<SearchOutcome>();
    apiMock.searchGames.mockReturnValueOnce(ok.promise);
    typeQuery("halo");
    act(() => vi.advanceTimersByTime(350));

    await act(async () => {
      ok.resolve({ games: [game({ rawgId: 2, name: "Halo Reach" })], source: "live" });
      await Promise.resolve();
    });
    await act(async () => {
      slow.reject(new Error("network died"));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.queryByText(/network died/)).toBeNull();
    expect(screen.getByTitle("Halo Reach")).toBeInTheDocument();
  });
});

describe("Search — results rendering", () => {
  it("shows the empty-state hint and the no-API-key warning", () => {
    useApp.setState({ hasApiKey: false });
    renderSearch();
    expect(screen.getByText(/No RAWG API key configured/)).toBeInTheDocument();
    expect(screen.getByText(/Start typing to search/)).toBeInTheDocument();
    expect(apiMock.searchGames).not.toHaveBeenCalled();
  });

  it("marks cache-sourced results with the offline chip", async () => {
    renderSearch();
    await searchFor("halo", { games: [game()], source: "cache" });
    expect(
      screen.getByText("Offline — showing results from your local cache"),
    ).toBeInTheDocument();
  });

  it("renders the meta line as year · developer · first two genres", async () => {
    renderSearch();
    await searchFor("halo", { games: [game()], source: "live" });
    expect(screen.getByText("2001 · Bungie · Shooter · Sci-Fi")).toBeInTheDocument();
  });

  it("appends the metacritic score to the meta line when present", async () => {
    renderSearch();
    await searchFor("halo", { games: [game({ metacritic: 94 })], source: "live" });
    expect(screen.getByText("2001 · Bungie · Shooter · Sci-Fi · MC 94")).toBeInTheDocument();
  });

  it("shows the no-results hint after a successful but empty search", async () => {
    renderSearch();
    await searchFor("zzzz", { games: [], source: "live" });
    expect(screen.getByText(/No games found for/)).toBeInTheDocument();
  });

  it("shows an error chip and clears results when the search fails", async () => {
    renderSearch();
    const d = deferred<SearchOutcome>();
    apiMock.searchGames.mockReturnValueOnce(d.promise);
    typeQuery("halo");
    act(() => vi.advanceTimersByTime(350));
    await act(async () => {
      d.reject(new Error("RAWG down"));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText(/RAWG down/)).toBeInTheDocument();
    expect(screen.queryByTitle("Halo")).toBeNull();
  });
});

describe("Search — ranking and filters", () => {
  /** The motivating case, in RAWG's (bad) relevance order. */
  function codOutcome(): SearchOutcome {
    return {
      source: "live",
      games: [
        game({ rawgId: 1, name: "Call of Duty", releaseDate: "2003-10-29", added: 1500, genres: ["Action"], platforms: ["Xbox"] }),
        game({ rawgId: 2, name: "Call of Duty: Modern Warfare II", releaseDate: "2022-10-28", added: 5300, genres: ["Shooter"], platforms: ["PC"] }),
        game({ rawgId: 3, name: "Call of Duty: Vanguard", releaseDate: "2021-11-05", added: 2000, genres: ["Action"], platforms: ["Xbox"] }),
      ],
    };
  }

  function cardNames(): string[] {
    return Array.from(document.querySelectorAll("h3")).map((h) => h.textContent);
  }

  it("re-ranks the RAWG pool: modern popular entries on top by default", async () => {
    renderSearch();
    await searchFor("call of duty", codOutcome());
    expect(cardNames()).toEqual([
      "Call of Duty: Modern Warfare II",
      "Call of Duty: Vanguard",
      "Call of Duty",
    ]);
  });

  it("switching to Best match puts the exact name match back on top", async () => {
    renderSearch();
    await searchFor("call of duty", codOutcome());
    fireEvent.click(screen.getByText("Best match"));
    expect(cardNames()[0]).toBe("Call of Duty");
  });

  it("genre chips filter the visible pool instantly without refetching", async () => {
    renderSearch();
    await searchFor("call of duty", codOutcome());
    fireEvent.click(screen.getByText("Filters"));
    expect(screen.getByText("Genres")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Shooter"));
    expect(cardNames()).toEqual(["Call of Duty: Modern Warfare II"]);
    expect(screen.queryByText(/No results match your filters/)).not.toBeInTheDocument();
    expect(apiMock.searchGames).toHaveBeenCalledTimes(1); // client-side only
  });

  it("chip filters that empty the pool show the filters hint, not no-results", async () => {
    renderSearch();
    await searchFor("call of duty", codOutcome());
    fireEvent.click(screen.getByText("Filters"));
    // Shooter genre keeps only the MWII remaster, which is PC-only; requiring
    // Xbox as well empties the pool (groups AND across, OR within a group).
    fireEvent.click(screen.getByText("Shooter"));
    fireEvent.click(screen.getByText("Xbox"));
    expect(screen.getByText(/No results match your filters/)).toBeInTheDocument();
  });

  it("year range and DLC toggle are sent as server-side filters (debounced)", async () => {
    const { container } = renderSearch();
    await searchFor("call of duty", codOutcome());
    // The DLC toggle sits in the toolbar, visible without opening the panel.
    expect(screen.getByText("Hide DLC & editions")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Filters"));

    const refetch = deferred<SearchOutcome>();
    apiMock.searchGames.mockReturnValueOnce(refetch.promise);
    fireEvent.change(screen.getByLabelText("Released from"), { target: { value: "2015" } });
    act(() => vi.advanceTimersByTime(349));
    expect(apiMock.searchGames).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(1));
    expect(apiMock.searchGames).toHaveBeenCalledTimes(2);
    expect(apiMock.searchGames).toHaveBeenLastCalledWith("call of duty", {
      filters: { fromYear: 2015, toYear: undefined, excludeAdditions: true },
    });
    await act(async () => {
      refetch.resolve(codOutcome());
      await Promise.resolve();
      await Promise.resolve();
    });

    const refetch2 = deferred<SearchOutcome>();
    apiMock.searchGames.mockReturnValueOnce(refetch2.promise);
    fireEvent.click(screen.getByText("Hide DLC & editions"));
    act(() => vi.advanceTimersByTime(350));
    expect(apiMock.searchGames).toHaveBeenLastCalledWith("call of duty", {
      filters: { fromYear: 2015, toYear: undefined, excludeAdditions: false },
    });
    await act(async () => {
      refetch2.resolve(codOutcome());
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container).toBeInTheDocument();
  });

  it("Custom preset auto-opens the filter panel with the ranking mix", async () => {
    renderSearch();
    await searchFor("call of duty", codOutcome());
    expect(screen.queryByText("Ranking mix")).toBeNull(); // panel starts closed
    fireEvent.click(screen.getByText("Custom"));
    expect(screen.getByText("Ranking mix")).toBeInTheDocument();
    expect(screen.getByText("Name match")).toBeInTheDocument();
    expect(screen.getByText("Popularity")).toBeInTheDocument();
    expect(screen.getByText("Recency")).toBeInTheDocument();
  });

  it("Custom chip stays neutral until the mix is touched; Reset restores defaults", async () => {
    renderSearch();
    await searchFor("call of duty", codOutcome());
    fireEvent.click(screen.getByText("Custom"));
    // Untouched Custom keeps the neutral chip style, not the bright active one.
    expect(screen.getByText("Custom")).toHaveClass("text-slate-400");
    expect(screen.getByText("Custom")).not.toHaveClass("text-accent-400");
    expect(screen.getByText("Ranking mix")).toBeInTheDocument();
    // The bar starts at the Balanced split (45 / 30 / 25).
    expect(screen.getByText("45%")).toBeInTheDocument();
    expect(screen.getByText("30%")).toBeInTheDocument();
    expect(screen.getByText("25%")).toBeInTheDocument();

    // Nudging a divider marks the mix as customized → bright chip + Reset.
    fireEvent.keyDown(screen.getByRole("slider", { name: /name match/i }), {
      key: "ArrowRight",
    });
    expect(screen.getByText("46%")).toBeInTheDocument();
    expect(screen.getByText("Custom")).toHaveClass("text-accent-400");
    expect(screen.getByText("Reset")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Reset"));
    expect(screen.getByText("Custom")).not.toHaveClass("text-accent-400");
    expect(screen.queryByText("Reset")).toBeNull();
    // Readouts back to the balanced defaults (45 / 30 / 25).
    expect(screen.getByText("45%")).toBeInTheDocument();
    expect(screen.getByText("30%")).toBeInTheDocument();
    expect(screen.getByText("25%")).toBeInTheDocument();
  });

  it("leaving Custom closes the filter panel, preset-to-preset keeps it untouched", async () => {
    renderSearch();
    await searchFor("call of duty", codOutcome());
    fireEvent.click(screen.getByText("Custom"));
    expect(screen.getByText("Ranking mix")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Newest"));
    expect(screen.queryByText("Ranking mix")).toBeNull();

    // Switching between two non-custom presets doesn't toggle the panel.
    fireEvent.click(screen.getByText("Filters"));
    expect(screen.getByText(/Released from/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Popular"));
    expect(screen.getByText(/Released from/)).toBeInTheDocument();
  });

  it("Clear all resets year and chip filters", async () => {
    renderSearch();
    await searchFor("call of duty", codOutcome());
    fireEvent.click(screen.getByText("Filters"));
    fireEvent.click(screen.getByText("Shooter"));
    expect(cardNames()).toEqual(["Call of Duty: Modern Warfare II"]);

    fireEvent.click(screen.getByText("Clear all"));
    expect(cardNames()).toHaveLength(3);
  });
});

describe("Search — adding to library", () => {
  async function renderWithResult() {
    renderSearch();
    await searchFor("halo", { games: [game({ rawgId: 11, name: "Halo 2" })], source: "live" });
  }

  it("opens a per-game status dropdown and adds via addToLibrary", async () => {
    apiMock.addToLibrary.mockResolvedValueOnce({ id: 77 } as never);
    await renderWithResult();

    fireEvent.click(screen.getByText("+ Add to library"));
    for (const label of ["Want to Play", "Playing", "Completed", "Dropped"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    fireEvent.click(screen.getByText("Playing"));

    expect(apiMock.addToLibrary).toHaveBeenCalledWith(
      expect.objectContaining({ rawgId: 11 }),
      "Playing",
    );
    await flushMicrotasks();
    expect(screen.getByText("Rate it now?")).toBeInTheDocument();
  });

  it("toggles the dropdown closed on a second click", async () => {
    await renderWithResult();
    fireEvent.click(screen.getByText("+ Add to library"));
    expect(screen.getByText("Completed")).toBeInTheDocument();
    fireEvent.click(screen.getByText("+ Add to library"));
    expect(screen.queryByText("Completed")).toBeNull();
  });

  it("navigates to the new entry from the rate prompt", async () => {
    apiMock.addToLibrary.mockResolvedValueOnce({ id: 88 } as never);
    await renderWithResult();
    fireEvent.click(screen.getByText("+ Add to library"));
    fireEvent.click(screen.getByText("Completed"));
    await flushMicrotasks();

    fireEvent.click(screen.getByText("Rate now"));
    expect(screen.getByText("detail-page")).toBeInTheDocument();
  });

  it("falls back to the in-library button after dismissing the rate prompt", async () => {
    apiMock.addToLibrary.mockResolvedValueOnce({ id: 88 } as never);
    await renderWithResult();
    fireEvent.click(screen.getByText("+ Add to library"));
    fireEvent.click(screen.getByText("Completed"));
    await flushMicrotasks();

    fireEvent.click(screen.getByText("Later"));
    expect(screen.queryByText("Rate it now?")).toBeNull();
    fireEvent.click(screen.getByText("✓ In your library — view"));
    expect(screen.getByText("library-page")).toBeInTheDocument();
  });

  it("marks previously-owned games as in-library, based on a fresh library query", async () => {
    apiMock.libraryQuery.mockResolvedValue([{ rawgId: 11 }] as never);
    await renderWithResult();
    expect(screen.getByText("✓ In your library — view")).toBeInTheDocument();
    expect(screen.queryByText("+ Add to library")).toBeNull();
  });

  it("shows an error and keeps the add button when adding fails", async () => {
    apiMock.addToLibrary.mockRejectedValueOnce(new Error("disk full"));
    await renderWithResult();
    fireEvent.click(screen.getByText("+ Add to library"));
    fireEvent.click(screen.getByText("Dropped"));
    await flushMicrotasks();
    expect(screen.getByText(/disk full/)).toBeInTheDocument();
    expect(screen.getByText("+ Add to library")).toBeInTheDocument();
  });
});
