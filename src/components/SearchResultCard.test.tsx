import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("../api", async () => {
  const m = await import("../test/apiMock");
  return { api: m.apiMock, localCover: m.localCoverMock };
});

import { localCoverMock } from "../test/apiMock";
import SearchResultCard from "./SearchResultCard";
import type { CachedGame } from "../types";

function game(overrides: Partial<CachedGame> = {}): CachedGame {
  return {
    rawgId: 1,
    name: "Halo",
    coverUrl: null,
    genres: ["Shooter", "Sci-Fi", "Adventure"],
    platforms: ["Xbox"],
    releaseDate: "2001-11-15",
    developer: "Bungie",
    ...overrides,
  };
}

function renderCard(overrides: Partial<Parameters<typeof SearchResultCard>[0]> = {}) {
  const props = {
    game: game(),
    inLibrary: false,
    adding: false,
    dropdownOpen: false,
    ratePrompt: false,
    onToggleDropdown: vi.fn(),
    onAdd: vi.fn(),
    onRateNow: vi.fn(),
    onRateLater: vi.fn(),
    onOpenLibrary: vi.fn(),
    ...overrides,
  };
  render(<SearchResultCard {...props} />);
  return props;
}

beforeEach(() => {
  localCoverMock.mockReset();
  localCoverMock.mockResolvedValue(null);
});

describe("SearchResultCard", () => {
  it("renders the meta line as year · developer · first two genres", () => {
    renderCard();
    expect(screen.getByText("2001 · Bungie · Shooter · Sci-Fi")).toBeInTheDocument();
    expect(screen.getByTitle("Halo")).toBeInTheDocument();
  });

  it("appends the metacritic score and drops missing fields", () => {
    renderCard({
      game: game({ developer: null, releaseDate: null, metacritic: 94, genres: ["Shooter"] }),
    });
    expect(screen.getByText("Shooter · MC 94")).toBeInTheDocument();
  });

  it("toggles the status dropdown and reports the picked status", () => {
    const props = renderCard();
    expect(screen.queryByText("Playing")).toBeNull();

    fireEvent.click(screen.getByText("+ Add to library"));
    expect(props.onToggleDropdown).toHaveBeenCalledTimes(1);
  });

  it("reports the picked status from the open dropdown", () => {
    const props = renderCard({ dropdownOpen: true });
    for (const label of ["Want to Play", "Playing", "Completed", "Dropped"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    fireEvent.click(screen.getByText("Playing"));
    expect(props.onAdd).toHaveBeenCalledWith("Playing");
  });

  it("shows a disabled Adding… button while the add is in flight", () => {
    renderCard({ adding: true });
    const button = screen.getByText("Adding…");
    expect(button).toBeDisabled();
  });

  it("shows the in-library button and opens the library through it", () => {
    const props = renderCard({ inLibrary: true });
    expect(screen.queryByText("+ Add to library")).toBeNull();
    fireEvent.click(screen.getByText("✓ In your library — view"));
    expect(props.onOpenLibrary).toHaveBeenCalledTimes(1);
  });

  it("swaps the in-library button for the rate prompt while it is active", () => {
    const props = renderCard({ inLibrary: true, ratePrompt: true });
    expect(screen.getByText("Rate it now?")).toBeInTheDocument();
    expect(screen.queryByText("✓ In your library — view")).toBeNull();

    fireEvent.click(screen.getByText("Rate now"));
    expect(props.onRateNow).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("Later"));
    expect(props.onRateLater).toHaveBeenCalledTimes(1);
  });
});
