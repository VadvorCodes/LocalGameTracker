import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("../../api", async () => {
  const m = await import("../../test/apiMock");
  return { api: m.apiMock, localCover: m.localCoverMock };
});

import { localCoverMock } from "../../test/apiMock";
import MatchCard from "./MatchCard";
import { makeEntry } from "../../test/utils";

beforeEach(() => {
  localCoverMock.mockResolvedValue(null);
});

describe("MatchCard", () => {
  it("renders the matched game's name, stars, score and status", () => {
    render(<MatchCard entry={makeEntry({ name: "Celeste", starRating: 5, computedOverall: 91.4, status: "Completed" })} />);
    expect(screen.getByTitle("Celeste")).toBeInTheDocument();
    expect(screen.getByTitle("5 / 5 stars")).toBeInTheDocument();
    expect(screen.getByText("91.4")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
  });

  it("omits the score badge when there is no detailed score", () => {
    render(<MatchCard entry={makeEntry({ computedOverall: null })} />);
    expect(screen.queryByText(/\d+\.\d/)).toBeNull();
  });
});
