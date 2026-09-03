import { act, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactElement } from "react";
import type { LibraryEntry, MiniEntry, Profile, ReratePoolItem } from "../types";

/** Render a component that uses routing (useNavigate / Link / useParams). */
export function renderWithRouter(ui: ReactElement, { route = "/" }: { route?: string } = {}) {
  return render(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>);
}

let nextId = 1000;

export function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 1,
    username: "tester",
    categoryWeights: { gameplay: 25, story: 25, music: 25, technical: 25 },
    createdAt: "2026-01-01T00:00:00",
    ...overrides,
  };
}

export function makeEntry(overrides: Partial<LibraryEntry> = {}): LibraryEntry {
  const id = overrides.id ?? nextId++;
  return {
    id,
    rawgId: 9000 + id,
    name: `Game ${id}`,
    coverUrl: null,
    genres: ["RPG"],
    platforms: ["PC"],
    releaseDate: "2020-06-15",
    developer: "Dev Studio",
    status: "Playing",
    favourite: false,
    playtimeMinutes: 120,
    startedAt: null,
    finishedAt: null,
    notes: "",
    createdAt: "2026-01-10T12:00:00",
    updatedAt: "2026-01-10T12:00:00",
    starRating: null,
    gameplay: null,
    story: null,
    music: null,
    technical: null,
    computedOverall: null,
    ratedAt: null,
    reratedAt: null,
    ...overrides,
  };
}

export function makeMini(overrides: Partial<MiniEntry> = {}): MiniEntry {
  return {
    entryId: 1,
    name: "Some Game",
    coverUrl: null,
    stars: 4,
    overall: 80,
    ...overrides,
  };
}

export function makePoolItem(
  entryOverrides: Partial<LibraryEntry> = {},
  similar: LibraryEntry[] = [],
): ReratePoolItem {
  return { entry: makeEntry(entryOverrides), similar };
}

/** An empty analytics payload; tests override the slices they care about. */
export function makeAnalytics(overrides: Record<string, unknown> = {}) {
  return {
    totalGames: 0,
    statusCounts: [],
    favourites: 0,
    totalPlaytimeMinutes: 0,
    avgStars: null,
    avgOverall: null,
    categoryAverages: { gameplay: null, story: null, music: null, technical: null },
    starDistribution: [1, 2, 3, 4, 5].map((x) => ({ x, y: 0 })),
    scoreDistribution: Array.from({ length: 10 }, (_, i) => ({ x: i * 10, y: 0 })),
    genreBreakdown: [],
    platformBreakdown: [],
    highestRated: [],
    lowestRated: [],
    recentlyRated: [],
    ratingTrend: [],
    categoryTrend: [],
    firstVsRecent: null,
    gutFeelingGames: [],
    onReflectionGames: [],
    ...overrides,
  };
}

/**
 * Dispatch a pointer (or mouse, on old jsdom) event at client coordinates.
 * Wrapped in act so React commits state updates between successive events —
 * a raw dispatchEvent would leave handlers reading stale closure state.
 */
export function firePointer(el: Element, type: string, x: number, y: number) {
  const Ctor =
    (window as unknown as { PointerEvent?: typeof MouseEvent }).PointerEvent ?? window.MouseEvent;
  act(() => {
    el.dispatchEvent(
      new Ctor(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        button: 0,
        buttons: type === "pointerup" ? 0 : 1,
        pointerId: 1,
      } as MouseEventInit),
    );
  });
}

/** Stub getBoundingClientRect on all current matches of a selector. */
export function stubRects(
  root: Document | Element,
  selector: string,
  rectFor: (el: Element, index: number) => Partial<DOMRect>,
) {
  root.querySelectorAll(selector).forEach((el, i) => {
    el.getBoundingClientRect = () =>
      ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        bottom: 0,
        right: 0,
        width: 0,
        height: 0,
        toJSON: () => ({}),
        ...rectFor(el, i),
      }) as DOMRect;
  });
}
