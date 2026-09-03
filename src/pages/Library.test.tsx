import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("../api", async () => {
  const m = await import("../test/apiMock");
  return { api: m.apiMock, localCover: m.localCoverMock };
});

import { apiMock, localCoverMock } from "../test/apiMock";
import { useApp } from "../store";
import Library from "./Library";
import { makeEntry, makeProfile } from "../test/utils";
import type { LibraryEntry } from "../types";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderLibrary() {
  return render(
    <MemoryRouter initialEntries={["/library"]}>
      <Routes>
        <Route path="/library" element={<Library />} />
        <Route path="/game/:id" element={<div>detail-page</div>} />
        <Route path="/search" element={<div>search-page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Let the 200ms debounce fire and the resulting promise chain settle. */
async function flushLoad() {
  await act(async () => {
    vi.advanceTimersByTime(200);
    await Promise.resolve();
    await Promise.resolve();
  });
}

function lastQuery() {
  const calls = apiMock.libraryQuery.mock.calls;
  return calls[calls.length - 1][0];
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  localCoverMock.mockResolvedValue(null);
  apiMock.libraryQuery.mockResolvedValue([]);
  apiMock.getGenresAndPlatforms.mockResolvedValue({
    genres: ["RPG", "Indie"],
    platforms: ["PC", "Switch"],
  });
  useApp.setState({
    profile: makeProfile(),
    profileLoading: false,
    settings: { theme: "midnight", customTheme: null, extendedSorting: false },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Library — loading and the query it sends", () => {
  it("shows ten skeletons while the first load is pending", () => {
    apiMock.libraryQuery.mockReturnValueOnce(new Promise(() => {}));
    renderLibrary();
    expect(document.querySelectorAll(".animate-pulse").length).toBe(10);
  });

  it("debounces 200ms and sends the default query", async () => {
    renderLibrary();
    expect(apiMock.libraryQuery).not.toHaveBeenCalled();
    await flushLoad();
    expect(apiMock.libraryQuery).toHaveBeenCalledTimes(1);
    const q = lastQuery();
    expect(q.search).toBeUndefined();
    expect(q.statuses).toEqual([]);
    expect(q.favouritesOnly).toBeUndefined();
    expect(q.minStars).toBeUndefined();
    expect(q.minScore).toBeUndefined();
    expect(q.sort).toBe("stars");
    expect(q.sortDesc).toBe(true);
  });

  it("restarts the debounce on every keystroke", async () => {
    renderLibrary();
    fireEvent.change(screen.getByPlaceholderText("Filter by name…"), { target: { value: "ze" } });
    await act(async () => {
      vi.advanceTimersByTime(199);
    });
    expect(apiMock.libraryQuery).not.toHaveBeenCalled();
    fireEvent.change(screen.getByPlaceholderText("Filter by name…"), {
      target: { value: "zelda" },
    });
    await flushLoad();
    expect(apiMock.libraryQuery).toHaveBeenCalledTimes(1);
    expect(lastQuery().search).toBe("zelda");
  });

  it("trims the name filter and omits it when blank", async () => {
    renderLibrary();
    fireEvent.change(screen.getByPlaceholderText("Filter by name…"), { target: { value: "  " } });
    await flushLoad();
    expect(lastQuery().search).toBeUndefined();
  });

  it("builds the query from every active filter", async () => {
    renderLibrary();
    await flushLoad();

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    fireEvent.click(screen.getByRole("button", { name: "Playing" })); // status chip
    fireEvent.click(screen.getByRole("button", { name: "♥ Favourites" }));
    fireEvent.click(screen.getByRole("button", { name: "RPG" })); // genre chip
    fireEvent.click(screen.getByRole("button", { name: "Switch" })); // platform chip
    const [minStars, minScore] = screen.getAllByRole("slider");
    fireEvent.change(minStars, { target: { value: "3.5" } });
    fireEvent.change(minScore, { target: { value: "50" } });
    await flushLoad();

    const q = lastQuery();
    expect(q.statuses).toEqual(["Playing"]);
    expect(q.favouritesOnly).toBe(true);
    expect(q.genres).toEqual(["RPG"]);
    expect(q.platforms).toEqual(["Switch"]);
    expect(q.minStars).toBe(3.5);
    expect(q.minScore).toBe(50);

    // unticking a chip removes it again
    fireEvent.click(screen.getByRole("button", { name: "RPG" }));
    await flushLoad();
    expect(lastQuery().genres).toEqual([]);
  });

  it("omits minStars/minScore while they sit at zero", async () => {
    renderLibrary();
    await flushLoad();
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    const [minStars, minScore] = screen.getAllByRole("slider");
    fireEvent.change(minStars, { target: { value: "0" } });
    fireEvent.change(minScore, { target: { value: "0" } });
    await flushLoad();
    expect(lastQuery().minStars).toBeUndefined();
    expect(lastQuery().minScore).toBeUndefined();
  });

  it("reloads when the profile changes", async () => {
    renderLibrary();
    await flushLoad();
    expect(apiMock.libraryQuery).toHaveBeenCalledTimes(1);
    await act(async () => {
      useApp.setState({ profile: makeProfile({ id: 2, username: "other" }) });
    });
    await flushLoad();
    expect(apiMock.libraryQuery).toHaveBeenCalledTimes(2);
  });
});

describe("Library — races", () => {
  it("keeps the newest query's results when an older response lands last", async () => {
    const slow = deferred<LibraryEntry[]>();
    const fast = deferred<LibraryEntry[]>();
    apiMock.libraryQuery.mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise);
    renderLibrary();
    await act(async () => {
      vi.advanceTimersByTime(200); // first query fires, hangs
    });

    fireEvent.change(screen.getByPlaceholderText("Filter by name…"), { target: { value: "hal" } });
    await act(async () => {
      vi.advanceTimersByTime(200); // second query fires
      fast.resolve([makeEntry({ id: 2, name: "Newest result" })]);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByTitle("Newest result")).toBeInTheDocument();

    await act(async () => {
      slow.resolve([makeEntry({ id: 1, name: "Stale result" })]);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.queryByTitle("Stale result")).toBeNull();
    expect(screen.getByTitle("Newest result")).toBeInTheDocument();
  });

  it("survives a getGenresAndPlatforms failure without an unhandled rejection", async () => {
    apiMock.getGenresAndPlatforms.mockRejectedValue(new Error("boom"));
    renderLibrary();
    await flushLoad();
    // the filter panel simply has no genre/platform options
    expect(screen.queryByText("Genres")).toBeNull();
    expect(screen.queryByText("Platforms")).toBeNull();
  });
});

describe("Library — header, filters UI and empty states", () => {
  it("renders counts with singular/plural and total tracked playtime", async () => {
    apiMock.libraryQuery.mockResolvedValue([
      makeEntry({ id: 1, playtimeMinutes: 60 }),
      makeEntry({ id: 2, playtimeMinutes: 125 }),
    ] as never);
    renderLibrary();
    await flushLoad();
    expect(screen.getByText("2 games · 3h 5m tracked")).toBeInTheDocument();
  });

  it("uses the singular when there is exactly one game, and hides playtime at zero", async () => {
    apiMock.libraryQuery.mockResolvedValue([makeEntry({ id: 1, playtimeMinutes: 0 })] as never);
    renderLibrary();
    await flushLoad();
    expect(screen.getByText("1 game")).toBeInTheDocument();
  });

  it("counts active filters and offers Clear all only then", async () => {
    renderLibrary();
    await flushLoad();
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(screen.getByRole("button", { name: "Filters" })).toHaveTextContent("Filters");
    expect(screen.queryByRole("button", { name: "Clear all" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Playing" }));
    fireEvent.click(screen.getByRole("button", { name: "♥ Favourites" }));
    fireEvent.click(screen.getByRole("button", { name: "RPG" }));
    expect(screen.getByRole("button", { name: "Filters (3)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear all" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(screen.getByRole("button", { name: "Filters" })).toHaveTextContent("Filters");
    await flushLoad();
    const q = lastQuery();
    expect(q.statuses).toEqual([]);
    expect(q.favouritesOnly).toBeUndefined();
    expect(q.genres).toEqual([]);
  });

  it("distinguishes filtered-empty from an empty library and links to search", async () => {
    renderLibrary();
    await flushLoad();
    expect(screen.getByText(/Your library is empty/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Go to search" }));
    expect(screen.getByText("search-page")).toBeInTheDocument();
  });

  it("shows the filtered-empty message when filters exclude everything", async () => {
    renderLibrary();
    await flushLoad();
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    fireEvent.click(screen.getByRole("button", { name: "♥ Favourites" }));
    await flushLoad();
    expect(screen.getByText("No games match these filters.")).toBeInTheDocument();
  });

  it("shows an error chip when the query fails", async () => {
    apiMock.libraryQuery.mockRejectedValueOnce(new Error("db gone"));
    renderLibrary();
    await flushLoad();
    expect(screen.getByText(/db gone/)).toBeInTheDocument();
  });

  it("opens a game card through to its detail route", async () => {
    apiMock.libraryQuery.mockResolvedValue([makeEntry({ id: 31, name: "Celeste" })] as never);
    renderLibrary();
    await flushLoad();
    fireEvent.click(screen.getByTitle("Celeste"));
    expect(screen.getByText("detail-page")).toBeInTheDocument();
  });
});

describe("Library — sort menu", () => {
  it("lists only primary sorts until extended sorting is enabled", async () => {
    const { container } = renderLibrary();
    await flushLoad();
    const select = container.querySelector("select")!;
    expect(select.value).toBe("stars");
    expect(screen.queryByRole("option", { name: "Playtime" })).toBeNull();

    useApp.setState({
      settings: { theme: "midnight", customTheme: null, extendedSorting: true },
    });
    await act(async () => {});
    await flushLoad();
    expect(screen.getByRole("option", { name: "Playtime" })).toBeInTheDocument();
    expect(container.querySelector("optgroup[label='Other']")!).toBeInTheDocument();
    expect(container.querySelector("optgroup[label='By category']")!).toBeInTheDocument();
  });

  it("queries with the chosen extended sort and direction", async () => {
    useApp.setState({
      settings: { theme: "midnight", customTheme: null, extendedSorting: true },
    });
    renderLibrary();
    await flushLoad();

    fireEvent.change(screen.getByDisplayValue("Rating"), { target: { value: "playtime" } });
    await flushLoad();
    expect(lastQuery().sort).toBe("playtime");

    fireEvent.click(screen.getByTitle("Descending"));
    await flushLoad();
    expect(lastQuery().sortDesc).toBe(false);
  });

  it("snaps back to Rating when extended sorting is switched off mid-sort", async () => {
    useApp.setState({
      settings: { theme: "midnight", customTheme: null, extendedSorting: true },
    });
    renderLibrary();
    await flushLoad();
    fireEvent.change(screen.getByDisplayValue("Rating"), { target: { value: "playtime" } });
    await flushLoad();
    expect(lastQuery().sort).toBe("playtime");

    useApp.setState({
      settings: { theme: "midnight", customTheme: null, extendedSorting: false },
    });
    await act(async () => {});
    await flushLoad();
    // select cannot render a value that no longer exists as an option
    expect(screen.getByDisplayValue("Rating")).toBeInTheDocument();
    expect(lastQuery().sort).toBe("stars");
  });
});
