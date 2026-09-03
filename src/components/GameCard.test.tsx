import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("../api", async () => {
  const m = await import("../test/apiMock");
  return { api: m.apiMock, localCover: m.localCoverMock };
});

import { localCoverMock } from "../test/apiMock";
import { GameCard, SkeletonCard } from "./GameCard";
import { makeEntry } from "../test/utils";

beforeEach(() => {
  localCoverMock.mockReset();
  localCoverMock.mockResolvedValue(null);
});

describe("GameCard", () => {
  it("renders name, status label and stars", () => {
    render(
      <GameCard
        entry={makeEntry({ name: "Hollow Knight", status: "Completed", starRating: 4.5 })}
        onOpen={() => {}}
      />,
    );
    expect(screen.getByText("Hollow Knight")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByTitle("4.5 / 5 stars")).toBeInTheDocument();
  });

  it("shows the favourite heart only when favourite", () => {
    const { container, rerender } = render(
      <GameCard entry={makeEntry({ favourite: false })} onOpen={() => {}} />,
    );
    expect(container.querySelector(".text-rose-400")).toBeNull();

    rerender(<GameCard entry={makeEntry({ favourite: true })} onOpen={() => {}} />);
    expect(container.querySelector(".text-rose-400")).not.toBeNull();
  });

  it("shows the overall badge only when a detailed score exists, coloured by tier", () => {
    const { container, rerender } = render(
      <GameCard entry={makeEntry({ computedOverall: null })} onOpen={() => {}} />,
    );
    expect(container.querySelector(".font-semibold.rounded")).toBeNull();

    rerender(<GameCard entry={makeEntry({ computedOverall: 82.3 })} onOpen={() => {}} />);
    const badge = () => container.querySelector(".font-semibold.rounded")!;
    expect(badge()).toHaveTextContent("82.3");
    expect(badge()).toHaveClass("text-emerald-300");

    rerender(<GameCard entry={makeEntry({ computedOverall: 60 })} onOpen={() => {}} />);
    expect(badge()).toHaveClass("text-amber-300");

    rerender(<GameCard entry={makeEntry({ computedOverall: 20 })} onOpen={() => {}} />);
    expect(badge()).toHaveClass("text-rose-300");
  });

  it("shows the playtime/genre footer only when playtime or genres exist", () => {
    const { container, rerender } = render(
      <GameCard entry={makeEntry({ playtimeMinutes: 0, genres: [] })} onOpen={() => {}} />,
    );
    expect(screen.queryByText(/2h/)).toBeNull();

    rerender(
      <GameCard
        entry={makeEntry({
          playtimeMinutes: 125,
          genres: ["RPG", "Action", "Adventure", " Indie"],
        })}
        onOpen={() => {}}
      />,
    );
    expect(screen.getByText("2h 5m")).toBeInTheDocument();
    // only the first three genres are shown
    expect(screen.getByText("RPG · Action · Adventure")).toBeInTheDocument();
    expect(container.textContent).not.toContain("Indie");
  });

  it("reports clicks through onOpen with the entry id", () => {
    const onOpen = vi.fn();
    const entry = makeEntry({ id: 55 });
    render(<GameCard entry={entry} onOpen={onOpen} />);
    fireEvent.click(screen.getByTitle("Game 55"));
    expect(onOpen).toHaveBeenCalledWith(55);
  });
});

describe("SkeletonCard", () => {
  it("renders a pulsing placeholder without content", () => {
    render(<SkeletonCard />);
    expect(document.querySelector(".animate-pulse")).toBeInTheDocument();
    expect(screen.queryByTitle("Game 55")).toBeNull();
  });
});
