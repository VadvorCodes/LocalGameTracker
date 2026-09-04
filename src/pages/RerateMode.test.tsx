import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../api", async () => {
  const m = await import("../test/apiMock");
  return { api: m.apiMock, localCover: m.localCoverMock };
});

import { apiMock, localCoverMock } from "../test/apiMock";
import { useApp } from "../store";
import RerateMode from "./RerateMode";
import {
  defaultSettings,
  flushMicrotasks,
  makeDataTransfer,
  makeEntry,
  makePoolItem,
  stubRects,
  transitionEnd,
} from "../test/utils";
import type { LibraryEntry, ReratePoolItem } from "../types";

function renderRerate() {
  return render(
    <MemoryRouter initialEntries={["/rerate"]}>
      <RerateMode />
    </MemoryRouter>,
  );
}

/** The flying SwipeCard root element. */
function swipeCard() {
  return document.querySelector<HTMLElement>('[data-testid="swipe-card"]')!;
}

async function startCycle(pool: ReratePoolItem[], rows: Partial<LibraryEntry>[] = [{}, {}]) {
  apiMock.libraryQuery.mockResolvedValueOnce(rows.map((r) => makeEntry(r)));
  apiMock.startRerateSession.mockResolvedValueOnce(pool);
  renderRerate();
  await screen.findByText(/ready to re-rate/);
  fireEvent.click(screen.getByRole("button", { name: "Start cycle" }));
  await screen.findByText(/Game 1 of/);
}

/** Decide the current card via a decision button, then land the fly-out. */
async function decide(buttonName: string) {
  fireEvent.click(screen.getByRole("button", { name: buttonName }));
  const card = swipeCard();
  expect(card).toBeDefined();
  transitionEnd(card);
  await flushMicrotasks();
}

beforeEach(() => {
  localCoverMock.mockReset().mockResolvedValue(null);
  apiMock.libraryQuery.mockReset().mockResolvedValue([]);
  apiMock.startRerateSession.mockReset();
  apiMock.markRerated.mockReset().mockResolvedValue(undefined);
  apiMock.setStarRating.mockReset();
  window.localStorage.clear();
  useApp.setState({
    profile: null,
    profileLoading: false,
    settings: defaultSettings(),
  });
});

describe("RerateMode — idle screen", () => {
  it("defaults to the played scope and queries it by name", async () => {
    renderRerate();
    expect(await screen.findByText(/games? ready to re-rate/)).toBeInTheDocument();
    expect(apiMock.libraryQuery).toHaveBeenCalledWith({
      statuses: ["Playing", "Completed", "Dropped"],
      sort: "name",
    });
    // played is the active side of the segmented control
    expect(screen.getByRole("button", { name: "All played games" })).toHaveClass("bg-accent-600");
  });

  it("honours a persisted finished scope", async () => {
    window.localStorage.setItem("rerate_scope", "finished");
    renderRerate();
    await screen.findByText(/ready to re-rate/);
    expect(apiMock.libraryQuery).toHaveBeenCalledWith({
      statuses: ["Completed", "Dropped"],
      sort: "name",
    });
    expect(screen.getByRole("button", { name: "Completed & dropped only" })).toHaveClass(
      "bg-accent-600",
    );
  });

  it("falls back to played when the persisted scope is garbage", async () => {
    window.localStorage.setItem("rerate_scope", "bogus");
    renderRerate();
    await screen.findByText(/ready to re-rate/);
    expect(apiMock.libraryQuery).toHaveBeenCalledWith({
      statuses: ["Playing", "Completed", "Dropped"],
      sort: "name",
    });
    expect(screen.getByRole("button", { name: "All played games" })).toHaveClass("bg-accent-600");
  });

  it("switching scope refetches and persists", async () => {
    renderRerate();
    await screen.findByText(/ready to re-rate/);
    fireEvent.click(screen.getByRole("button", { name: "Completed & dropped only" }));
    await waitFor(() =>
      expect(apiMock.libraryQuery).toHaveBeenLastCalledWith({
        statuses: ["Completed", "Dropped"],
        sort: "name",
      }),
    );
    expect(window.localStorage.getItem("rerate_scope")).toBe("finished");
  });

  describe("eligibility sentences and gating", () => {
    async function expectSentence(
      rows: Partial<LibraryEntry>[],
      sentence: RegExp,
      extras: string[] = [],
    ) {
      apiMock.libraryQuery.mockResolvedValueOnce(rows.map((r) => makeEntry(r)));
      renderRerate();
      expect(await screen.findByText(sentence)).toBeInTheDocument();
      for (const extra of extras) {
        expect(screen.getByText(extra)).toBeInTheDocument();
      }
    }

    it("blocks starting with fewer than two games in scope", async () => {
      await expectSentence([], /0 games ready to re-rate\./, [
        "You need at least 2 games in scope to start a cycle.",
      ]);
      expect(screen.getByRole("button", { name: "Start cycle" })).toBeDisabled();
    });

    it("uses the singular for one game", async () => {
      await expectSentence([{}], /1 game ready to re-rate\.$/);
      expect(screen.getByRole("button", { name: "Start cycle" })).toBeDisabled();
    });

    it("reports cooling games and the cycle size", async () => {
      await expectSentence(
        [{}, {}, {}, {}, { reratedAt: "2026-08-01" }],
        /4 games ready to re-rate · 1 cooling down from your last cycle — cycles of 10\./,
      );
      expect(screen.getByRole("button", { name: "Start cycle" })).toBeEnabled();
    });

    it("defaults to cycles of 10", async () => {
      await expectSentence(
        Array.from({ length: 24 }, () => ({})),
        /— cycles of 10\./,
      );
    });

    it("switches the cycle size, persists it and reflects it in the sentence", async () => {
      apiMock.libraryQuery.mockResolvedValue(Array.from({ length: 24 }, () => makeEntry({})));
      renderRerate();
      expect(await screen.findByText(/— cycles of 10\./)).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "20" }));
      expect(await screen.findByText(/— cycles of 20\./)).toBeInTheDocument();
      expect(window.localStorage.getItem("rerate_cycle_size")).toBe("20");

      fireEvent.click(screen.getByRole("button", { name: "Full library" }));
      expect(await screen.findByText(/— one cycle of all 24\./)).toBeInTheDocument();
      expect(window.localStorage.getItem("rerate_cycle_size")).toBe("full");
    });

    it("honours a persisted cycle size and passes it to the session", async () => {
      window.localStorage.setItem("rerate_cycle_size", "5");
      apiMock.libraryQuery.mockResolvedValueOnce(Array.from({ length: 24 }, () => makeEntry({})));
      apiMock.startRerateSession.mockResolvedValueOnce([]);
      renderRerate();
      expect(await screen.findByText(/— cycles of 5\./)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Start cycle" }));
      await screen.findByText(/No games are in scope right now/);
      expect(apiMock.startRerateSession).toHaveBeenCalledWith(
        ["Playing", "Completed", "Dropped"],
        // the api layer stringifies the size for the Tauri command
        5,
      );
    });

    it("falls back to cycles of 10 when the persisted size is garbage", async () => {
      window.localStorage.setItem("rerate_cycle_size", "99");
      apiMock.libraryQuery.mockResolvedValueOnce(Array.from({ length: 24 }, () => makeEntry({})));
      renderRerate();
      expect(await screen.findByText(/— cycles of 10\./)).toBeInTheDocument();
    });

    it("warns when everything in scope is cooling down", async () => {
      await expectSentence(
        [{ reratedAt: "2026-08-01" }, { reratedAt: "2026-08-02" }],
        /0 games ready to re-rate · 2 cooling down from your last cycle — cycles of 10\./,
        [
          "Everything in scope is cooling down — starting now resets the cooldown and puts all 2 games back in the pool.",
        ],
      );
    });
  });

  it("starts a cycle and enters the swipe phase", async () => {
    apiMock.libraryQuery.mockResolvedValueOnce([makeEntry(), makeEntry()]);
    apiMock.startRerateSession.mockResolvedValueOnce([makePoolItem(), makePoolItem()]);
    renderRerate();
    await screen.findByText(/ready to re-rate/);
    fireEvent.click(screen.getByRole("button", { name: "Start cycle" }));
    expect(await screen.findByText(/Game 1 of 2/)).toBeInTheDocument();
    expect(apiMock.startRerateSession).toHaveBeenCalledWith(
      ["Playing", "Completed", "Dropped"],
      10,
    );
  });

  it("returns to idle with an error when the pool comes back empty", async () => {
    apiMock.libraryQuery.mockResolvedValueOnce([makeEntry(), makeEntry()]);
    apiMock.startRerateSession.mockResolvedValueOnce([]);
    renderRerate();
    await screen.findByText(/ready to re-rate/);
    fireEvent.click(screen.getByRole("button", { name: "Start cycle" }));
    expect(await screen.findByText(/No games are in scope right now/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start cycle" })).toBeInTheDocument();
  });

  it("surfaces a session failure on the idle screen", async () => {
    apiMock.libraryQuery.mockResolvedValueOnce([makeEntry(), makeEntry()]);
    apiMock.startRerateSession.mockRejectedValueOnce(new Error("shuffle failed"));
    renderRerate();
    await screen.findByText(/ready to re-rate/);
    fireEvent.click(screen.getByRole("button", { name: "Start cycle" }));
    expect(await screen.findByText(/shuffle failed/)).toBeInTheDocument();
  });

  it("keeps the counting state when the scope rows fail to load", async () => {
    apiMock.libraryQuery.mockRejectedValueOnce(new Error("db gone"));
    renderRerate();
    expect(await screen.findByText("Counting eligible games…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start cycle" })).toBeDisabled();
  });
});

describe("RerateMode — swipe phase", () => {
  const pool = () => [
    makePoolItem({ id: 1, name: "Game One" }, [makeEntry({ id: 9, name: "Similar Game" })]),
    makePoolItem({ id: 2, name: "Game Two" }),
  ];

  async function enterSwipe() {
    await startCycle(pool());
  }

  it("shows the current game, progress bars and genre matches", async () => {
    await enterSwipe();
    expect(screen.getByText("Game 1 of 2 · 0 categorised")).toBeInTheDocument();
    expect(screen.getByText("Game One")).toBeInTheDocument();
    expect(screen.getByText("Similar Game")).toBeInTheDocument(); // MatchCard
    // two progress tracks, both undecided
    expect(document.querySelectorAll(".h-1\\.5").length).toBe(2);
  });

  it("decides via the buttons, colours the bar and advances", async () => {
    await enterSwipe();
    await decide("✕ Re-rate");
    expect(screen.getByText("Game 2 of 2 · 1 categorised")).toBeInTheDocument();
    // first track turned rose
    expect(document.querySelectorAll(".bg-rose-500.h-1\\.5").length).toBe(1);
    expect(screen.getByText("Game Two")).toBeInTheDocument();
  });

  it("decides via the arrow keys", async () => {
    await enterSwipe();
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    const card = swipeCard();
    transitionEnd(card);
    await flushMicrotasks();
    expect(screen.getByText("Game 2 of 2 · 1 categorised")).toBeInTheDocument();
  });

  it("records a decision exactly once even if the transition ends twice", async () => {
    await enterSwipe();
    fireEvent.click(screen.getByRole("button", { name: "✕ Re-rate" }));
    const card = swipeCard();
    transitionEnd(card);
    transitionEnd(card); // double fire
    await flushMicrotasks();
    expect(screen.getByText("Game 2 of 2 · 1 categorised")).toBeInTheDocument();
  });

  it("drops the decision through to the review piles after the last card", async () => {
    await enterSwipe();
    await decide("✕ Re-rate");
    await decide("✓ Keep rating");
    expect(await screen.findByText("Cycle review")).toBeInTheDocument();
    expect(screen.getByText("Re-rate — 1")).toBeInTheDocument();
    expect(screen.getByText("Keep rating — 1")).toBeInTheDocument();
  });

  it("cancels back to a fresh idle screen", async () => {
    await enterSwipe();
    fireEvent.click(screen.getByRole("button", { name: "Cancel cycle" }));
    await screen.findByText(/ready to re-rate/);
    // idle effect re-queried after the reset
    await waitFor(() =>
      expect(apiMock.libraryQuery).toHaveBeenLastCalledWith({
        statuses: ["Playing", "Completed", "Dropped"],
        sort: "name",
      }),
    );
  });
});

describe("RerateMode — review phase", () => {
  const pool = () => [
    makePoolItem({ id: 1, name: "Alpha" }),
    makePoolItem({ id: 2, name: "Beta" }),
    makePoolItem({ id: 3, name: "Gamma" }),
  ];

  /** Enter swipe, rerate Alpha+Beta, keep Gamma → review with a 2-row pile. */
  async function enterReview() {
    await startCycle(pool());
    await decide("✕ Re-rate"); // Alpha
    await decide("✕ Re-rate"); // Beta
    await decide("✓ Keep rating"); // Gamma
    await screen.findByText("Cycle review");
  }

  it("toggles a row between piles on click", async () => {
    await enterReview();
    fireEvent.click(screen.getByText("Alpha").closest("button")!);
    expect(screen.getByText("Re-rate — 1")).toBeInTheDocument();
    expect(screen.getByText("Keep rating — 2")).toBeInTheDocument();
  });

  it("reorders a pile when a row is dragged onto another row", async () => {
    await enterReview();
    const section = screen.getByText("Re-rate — 2").closest("section")!;
    // Beta sits below Alpha; stubRects stacks them by index (i = 0 → Alpha).
    const betaRow = section.querySelectorAll("[data-pile-row]")[1];

    const dataTransfer = makeDataTransfer();

    // two stacked rows: Alpha on top (i = 0), Beta below it (i = 1)
    stubRects(section, "[data-pile-row]", (_el, i) => ({
      left: 0,
      right: 200,
      width: 200,
      top: i * 70,
      bottom: i * 70 + 60,
      height: 60,
    }));

    const startEvt = new Event("dragstart", { bubbles: true, cancelable: true });
    Object.defineProperty(startEvt, "dataTransfer", { value: dataTransfer });
    act(() => fireEvent(betaRow, startEvt));

    const overEvt = new Event("dragover", { bubbles: true, cancelable: true });
    Object.defineProperty(overEvt, "dataTransfer", { value: dataTransfer });
    Object.defineProperty(overEvt, "clientX", { value: 50 }); // left half of Alpha
    Object.defineProperty(overEvt, "clientY", { value: 30 }); // inside Alpha
    act(() => fireEvent(section, overEvt));

    // the drop indicator ring is showing while dragging
    expect(section.querySelector(".ring-1")).not.toBeNull();

    const dropEvt = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(dropEvt, "dataTransfer", { value: dataTransfer });
    Object.defineProperty(dropEvt, "clientX", { value: 50 });
    Object.defineProperty(dropEvt, "clientY", { value: 30 });
    act(() => fireEvent(section, dropEvt));

    await flushMicrotasks();
    const rows = section.querySelectorAll("[data-pile-row]");
    expect(rows[0].textContent).toContain("Beta");
    expect(rows[1].textContent).toContain("Alpha");
    expect(section.querySelector(".ring-1")).toBeNull();
  });

  it("moves a game across piles by dragging it onto the other pile", async () => {
    await enterReview();
    const keepSection = screen.getByText("Keep rating — 1").closest("section")!;
    const rerateSection = screen.getByText("Re-rate — 2").closest("section")!;
    const gammaRow = keepSection.querySelector("[data-pile-row]")!;

    const dataTransfer = makeDataTransfer();
    const rowRect = { left: 0, right: 200, width: 200, top: 0, bottom: 60, height: 60 };
    stubRects(keepSection, "[data-pile-row]", () => rowRect);

    const startEvt = new Event("dragstart", { bubbles: true, cancelable: true });
    Object.defineProperty(startEvt, "dataTransfer", { value: dataTransfer });
    act(() => fireEvent(gammaRow, startEvt));

    // drop far below the (empty of rows) re-rate section → appended
    stubRects(rerateSection, "[data-pile-row]", () => rowRect);
    const dropEvt = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(dropEvt, "dataTransfer", { value: dataTransfer });
    Object.defineProperty(dropEvt, "clientX", { value: 100 });
    Object.defineProperty(dropEvt, "clientY", { value: 500 }); // below all rows → append
    act(() => fireEvent(rerateSection, dropEvt));

    await flushMicrotasks();
    expect(screen.getByText("Re-rate — 3")).toBeInTheDocument();
    expect(screen.getByText("Keep rating — 0")).toBeInTheDocument();
    // empty pile shows the drop placeholder
    expect(screen.getByText(/Nothing here — drop a game/)).toBeInTheDocument();
  });

  it("goes back to swiping with previous-choice reminders", async () => {
    await enterReview();
    fireEvent.click(screen.getByRole("button", { name: "← Back to swiping" }));
    expect(await screen.findByText("Game 1 of 3 · 0 categorised")).toBeInTheDocument();
    // the squares under the decision buttons show last cycle's choice for the card
    const indicator = document.querySelectorAll('[title="Chosen last time"]');
    expect(indicator.length).toBe(1);
    expect(indicator[0]).toHaveClass("bg-rose-500");

    // re-decide everything → review again
    await decide("✕ Re-rate");
    await decide("✕ Re-rate");
    await decide("✕ Re-rate");
    expect(await screen.findByText("Re-rate — 3")).toBeInTheDocument();
  });

  it("confirming an empty re-rate pile finishes the cycle directly", async () => {
    await startEmptyRerate();
    // all three kept
    fireEvent.click(screen.getByRole("button", { name: "Confirm & finish" }));
    expect(await screen.findByText("Cycle complete")).toBeInTheDocument();
    expect(screen.getByText(/0 re-rated · 0 skipped · 3 kept their/)).toBeInTheDocument();
  });

  async function startEmptyRerate() {
    await startCycle(pool());
    await decide("✓ Keep rating");
    await decide("✓ Keep rating");
    await decide("✓ Keep rating");
    await screen.findByText("Cycle review");
  }

  it("confirming a populated pile enters the re-rating phase", async () => {
    await enterReview();
    fireEvent.click(screen.getByRole("button", { name: "Confirm & start re-rating" }));
    expect(await screen.findByText(/Game 1 of 2 — update the scores/)).toBeInTheDocument();
  });
});

describe("RerateMode — re-rating and done", () => {
  async function enterRerate() {
    await startCycle([
      makePoolItem({ id: 1, name: "Alpha" }),
      makePoolItem({ id: 2, name: "Beta" }),
      makePoolItem({ id: 3, name: "Gamma" }),
    ]);
    await decide("✕ Re-rate"); // Alpha
    await decide("✓ Keep rating"); // Beta
    await decide("✓ Keep rating"); // Gamma
    await screen.findByText("Cycle review");
    fireEvent.click(screen.getByRole("button", { name: "Confirm & start re-rating" }));
    await screen.findByText(/Game 1 of 1/);
  }

  it("saves the new rating, tags the game and reaches the summary", async () => {
    await enterRerate();
    apiMock.setStarRating.mockResolvedValueOnce(makeEntry({ id: 1, starRating: 2 }));
    fireEvent.click(screen.getByLabelText("2 stars"));
    fireEvent.click(screen.getByRole("button", { name: "Save & continue" }));

    await waitFor(() => expect(apiMock.markRerated).toHaveBeenCalledWith(1));
    expect(await screen.findByText("Cycle complete")).toBeInTheDocument();
    expect(screen.getByText(/1 re-rated · 0 skipped · 2 kept their/)).toBeInTheDocument();
  });

  it("skipping leaves the game untagged and still counts in the summary", async () => {
    await enterRerate();
    fireEvent.click(screen.getByRole("button", { name: "Skip — leave as is" }));

    expect(apiMock.markRerated).not.toHaveBeenCalled();
    expect(await screen.findByText("Cycle complete")).toBeInTheDocument();
    expect(screen.getByText(/0 re-rated · 1 skipped · 2 kept their/)).toBeInTheDocument();
  });

  it("offers another cycle and a way back to the library", async () => {
    await enterRerate();
    fireEvent.click(screen.getByRole("button", { name: "Skip — leave as is" }));
    await screen.findByText("Cycle complete");
    expect(screen.getByText("Back to Library")).toHaveAttribute("href", "/library");

    fireEvent.click(screen.getByRole("button", { name: "Start another cycle" }));
    expect(await screen.findByText(/ready to re-rate/)).toBeInTheDocument();
  });
});
