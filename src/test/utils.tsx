import { act, fireEvent } from "@testing-library/react";
import { vi } from "vitest";
import type {
  CachedGame,
  LibraryEntry,
  MiniEntry,
  Profile,
  ReratePoolItem,
  UiSettings,
} from "../types";

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

/** A bare RAWG cache hit; tests override the fields they care about. */
export function makeCachedGame(overrides: Partial<CachedGame> = {}): CachedGame {
  return {
    rawgId: 0,
    name: "",
    coverUrl: null,
    genres: [],
    platforms: [],
    releaseDate: null,
    developer: null,
    ...overrides,
  };
}

/** The settings the store boots with; tests override the slices they care about. */
export function defaultSettings(overrides: Partial<UiSettings> = {}): UiSettings {
  return { theme: "midnight", customTheme: null, extendedSorting: false, ...overrides };
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

/** Resolve/reject a promise from the test, for racing slow responses. */
export function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * Fire a `transitionend` event (act-wrapped so the handler's state update
 * commits). `propertyName` defaults to the card transform that fly-outs wait for.
 */
export function transitionEnd(el: Element, propertyName = "transform") {
  const evt = new Event("transitionend", { bubbles: true });
  Object.defineProperty(evt, "propertyName", { value: propertyName });
  act(() => {
    fireEvent(el, evt);
  });
}

/** Settle pending promise chains inside act (two microtask turns). */
export function flushMicrotasks() {
  return act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

/** A minimal DataTransfer stand-in, since jsdom drag events ship without one. */
export function makeDataTransfer() {
  const data: Record<string, string> = {};
  return {
    data,
    setData(type: string, v: string) {
      data[type] = v;
    },
    getData(type: string) {
      return data[type];
    },
    effectAllowed: "",
    dropEffect: "",
  };
}

// Deterministic rAF: callbacks are queued and flushed explicitly, so tests do
// not depend on how jsdom schedules frames under fake timers.
let rafQueue: (FrameRequestCallback | null)[] = [];

/** Run (and clear) the animation-frame callbacks queued since the last flush. */
export function flushRaf() {
  const pending = rafQueue;
  rafQueue = [];
  pending.forEach((cb) => cb?.(16));
}

/** Fake timers plus a queued requestAnimationFrame stub. Pair with restoreTimersAndRaf(). */
export function useQueuedRaf() {
  rafQueue = [];
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    rafQueue.push(cb);
    return rafQueue.length - 1;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    rafQueue[id] = null;
  });
}

/** Undo useQueuedRaf: restore the real timers and globals. */
export function restoreTimersAndRaf() {
  vi.unstubAllGlobals();
  vi.useRealTimers();
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
