import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("../../api", async () => {
  const m = await import("../../test/apiMock");
  return { api: m.apiMock, localCover: m.localCoverMock };
});

import { apiMock, localCoverMock } from "../../test/apiMock";
import { useApp } from "../../store";
import RerateRatingPanel from "./RerateRatingPanel";
import { makeEntry, makeProfile } from "../../test/utils";

const WEIGHTS = { gameplay: 50, story: 25, music: 15, technical: 10 };

beforeEach(() => {
  localCoverMock.mockReset().mockResolvedValue(null);
  apiMock.markRerated.mockReset();
  apiMock.setStarRating.mockReset();
  apiMock.setCategoryScores.mockReset();
  useApp.setState({ profile: makeProfile({ categoryWeights: WEIGHTS }) });
});

function renderPanel(entry = makeEntry({ name: "Hollow Knight", ratedAt: "2026-01-01T00:00:00" })) {
  const onSaved = vi.fn();
  const onSkipped = vi.fn();
  render(<RerateRatingPanel entry={entry} onSaved={onSaved} onSkipped={onSkipped} />);
  return { entry, onSaved, onSkipped };
}

describe("RerateRatingPanel rendering", () => {
  it("shows the game, previous stars and previous category scores", () => {
    renderPanel(
      makeEntry({
        name: "Hollow Knight",
        starRating: 4,
        gameplay: 70,
        music: null,
        ratedAt: "2026-01-01T00:00:00",
      }),
    );
    expect(screen.getByText("Hollow Knight")).toBeInTheDocument();
    const quickSection = screen.getByText("Quick rating").closest("section")!;
    expect(quickSection.textContent).toContain("was");
    expect(screen.getByText("4/5")).toBeInTheDocument();
    expect(screen.getByText(/Gameplay/).textContent).toContain("was 70");
    expect(screen.getByText(/Music/).textContent).not.toContain("was");
    expect(screen.getByText(/Rated a while ago/)).toBeInTheDocument();
  });

  it("says 'before' when the game was never rated", () => {
    renderPanel(makeEntry({ ratedAt: null }));
    expect(screen.getByText(/Rated before/)).toBeInTheDocument();
  });

  it("previews the weighted overall with profile weights and renormalisation", () => {
    renderPanel(makeEntry({ computedOverall: 62 }));
    const sliders = screen.getAllByRole("slider");
    fireEvent.change(sliders[0], { target: { value: "80" } }); // gameplay only
    // gameplay weight 50 renormalised to 100% → 80.0
    expect(screen.getByText("80.0")).toBeInTheDocument();

    fireEvent.change(sliders[1], { target: { value: "60" } }); // + story
    // (80*50 + 60*25) / 75 = 73.33 → 73.3
    expect(screen.getByText("73.3")).toBeInTheDocument();
    expect(screen.getByText("was 62.0")).toBeInTheDocument();
  });

  it("shows an em dash preview when no category is filled", () => {
    renderPanel();
    // one per unfilled category plus the preview itself
    expect(screen.getAllByText("—").length).toBe(5);
  });

  it("shows the divergence line only when a star draft and a preview both exist", () => {
    renderPanel();
    expect(screen.queryByText(/well above your detailed score/)).toBeNull();

    fireEvent.click(screen.getByLabelText("4 stars"));
    const sliders = screen.getAllByRole("slider");
    fireEvent.change(sliders[0], { target: { value: "40" } }); // preview 40, stars*20=80 → +40
    expect(screen.getByText(/well above your detailed score/)).toBeInTheDocument();
  });
});

describe("RerateRatingPanel saving", () => {
  it("with no changes: only marks rerated and hands back the entry untouched", async () => {
    apiMock.markRerated.mockResolvedValueOnce(undefined);
    const { entry, onSaved } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Save & continue" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(apiMock.setStarRating).not.toHaveBeenCalled();
    expect(apiMock.setCategoryScores).not.toHaveBeenCalled();
    expect(apiMock.markRerated).toHaveBeenCalledWith(entry.id);
    expect(onSaved).toHaveBeenCalledWith(entry);
  });

  it("with only a star change: skips setCategoryScores, passes the star response on", async () => {
    const updated = makeEntry({ id: 5, starRating: 4 });
    apiMock.setStarRating.mockResolvedValueOnce(updated);
    apiMock.markRerated.mockResolvedValueOnce(undefined);
    const { onSaved } = renderPanel(makeEntry({ id: 5 }));
    fireEvent.click(screen.getByLabelText("4 stars"));
    fireEvent.click(screen.getByRole("button", { name: "Save & continue" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(updated));
    expect(apiMock.setStarRating).toHaveBeenCalledWith(5, 4);
    expect(apiMock.setCategoryScores).not.toHaveBeenCalled();
    expect(apiMock.markRerated).toHaveBeenCalledWith(5);
  });

  it("with both changed: the category-score response wins as the saved entry", async () => {
    const afterStars = makeEntry({ id: 6, starRating: 4 });
    const afterScores = makeEntry({ id: 6, starRating: 4, gameplay: 80 });
    apiMock.setStarRating.mockResolvedValueOnce(afterStars);
    apiMock.setCategoryScores.mockResolvedValueOnce(afterScores);
    apiMock.markRerated.mockResolvedValueOnce(undefined);
    const { onSaved } = renderPanel(makeEntry({ id: 6 }));

    fireEvent.click(screen.getByLabelText("4 stars"));
    fireEvent.change(screen.getAllByRole("slider")[0], { target: { value: "80" } });
    fireEvent.click(screen.getByRole("button", { name: "Save & continue" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(afterScores));
    expect(apiMock.setStarRating).toHaveBeenCalledWith(6, 4);
    expect(apiMock.setCategoryScores).toHaveBeenCalledWith(6, {
      gameplay: 80,
      story: null,
      music: null,
      technical: null,
    });
  });

  it("clearing the star rating to null is a real change worth saving", async () => {
    apiMock.setStarRating.mockResolvedValueOnce(makeEntry({ id: 7, starRating: null }));
    apiMock.markRerated.mockResolvedValueOnce(undefined);
    renderPanel(makeEntry({ id: 7, starRating: 4 }));
    fireEvent.click(screen.getByLabelText("4 stars")); // picker clears to null
    fireEvent.click(screen.getByRole("button", { name: "Save & continue" }));

    await waitFor(() => expect(apiMock.setStarRating).toHaveBeenCalledWith(7, null));
  });

  it("skip makes zero API calls — the game stays untagged", () => {
    const { onSkipped } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Skip — leave as is" }));
    expect(onSkipped).toHaveBeenCalledTimes(1);
    expect(apiMock.setStarRating).not.toHaveBeenCalled();
    expect(apiMock.setCategoryScores).not.toHaveBeenCalled();
    expect(apiMock.markRerated).not.toHaveBeenCalled();
  });

  it("shows an error, skips markRerated/onSaved, and re-enables buttons on failure", async () => {
    apiMock.setStarRating.mockRejectedValueOnce(new Error("db locked"));
    renderPanel();
    fireEvent.click(screen.getByLabelText("4 stars"));
    fireEvent.click(screen.getByRole("button", { name: "Save & continue" }));

    await waitFor(() => expect(screen.getByText(/db locked/)).toBeInTheDocument());
    expect(apiMock.markRerated).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save & continue" })).toBeEnabled();
  });

  it("treats a markRerated failure as unsaved", async () => {
    apiMock.markRerated.mockRejectedValueOnce(new Error("tag failed"));
    const { onSaved } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Save & continue" }));

    await waitFor(() => expect(screen.getByText(/tag failed/)).toBeInTheDocument());
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("shows Saving… and disables both buttons while a save is in flight", () => {
    apiMock.markRerated.mockReturnValueOnce(new Promise(() => {}));
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Save & continue" }));
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Skip — leave as is" })).toBeDisabled();
  });
});

describe("RerateRatingPanel weights fallback", () => {
  it("uses equal 25% weights when no profile is loaded", () => {
    useApp.setState({ profile: null });
    renderPanel();
    const sliders = screen.getAllByRole("slider");
    fireEvent.change(sliders[2], { target: { value: "80" } }); // music only
    expect(screen.getByText("80.0")).toBeInTheDocument(); // renormalised to 100%
  });
});
