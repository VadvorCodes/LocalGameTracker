import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";

vi.mock("../api", async () => {
  const m = await import("../test/apiMock");
  return { api: m.apiMock, localCover: m.localCoverMock };
});

import { apiMock, localCoverMock } from "../test/apiMock";
import { useApp } from "../store";
import GameDetail from "./GameDetail";
import { deferred, makeEntry, makeProfile } from "../test/utils";
import type { LibraryEntry } from "../types";

function NavProbe({ to }: { to: string }) {
  const navigate = useNavigate();
  return <button onClick={() => navigate(to)}>nav:{to}</button>;
}

function renderDetail(route = "/game/5") {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route
          path="/game/:id"
          element={
            <>
              <NavProbe to="/game/6" />
              <GameDetail />
            </>
          }
        />
        <Route path="/library" element={<div>library-page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const WEIGHTS = { gameplay: 50, story: 25, music: 15, technical: 10 };

const baseEntry = () =>
  makeEntry({
    id: 5,
    name: "Hollow Knight",
    status: "Playing",
    playtimeMinutes: 300, // 5h → preset "5"
    startedAt: "2020-01-01",
    finishedAt: "2020-02-01",
    notes: "original notes",
    starRating: 4,
    computedOverall: 62.5,
    gameplay: 70,
  });

beforeEach(() => {
  localCoverMock.mockReset().mockResolvedValue(null);
  apiMock.getLibraryEntry.mockReset().mockResolvedValue(baseEntry());
  apiMock.updateLibraryEntry
    .mockReset()
    .mockImplementation(async (_id: number, patch: Partial<LibraryEntry>) =>
      Object.assign(baseEntry(), patch),
    );
  apiMock.removeLibraryEntry.mockReset();
  apiMock.setStarRating.mockReset();
  apiMock.setCategoryScores.mockReset();
  useApp.setState({ profile: makeProfile({ categoryWeights: WEIGHTS }), profileLoading: false });
});

async function renderLoaded() {
  const view = renderDetail();
  await screen.findByText("Hollow Knight");
  return view;
}

describe("GameDetail — loading", () => {
  it("fetches the entry by route id and shows its data", async () => {
    await renderLoaded();
    expect(apiMock.getLibraryEntry).toHaveBeenCalledWith(5);
    expect(screen.getByText("Hollow Knight")).toBeInTheDocument();
    expect(screen.getByText("Tracked: 5h")).toBeInTheDocument();
    // hours preset derived from 300 minutes
    expect(screen.getByDisplayValue("5+ hours")).toBeInTheDocument();
  });

  it("shows an error (not an eternal skeleton) for a non-numeric id and makes no request", async () => {
    renderDetail("/game/abc");
    expect(await screen.findByText(/Invalid entry id/)).toBeInTheDocument();
    expect(apiMock.getLibraryEntry).not.toHaveBeenCalled();
    expect(document.querySelector(".animate-pulse")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Back to library" }));
    expect(screen.getByText("library-page")).toBeInTheDocument();
  });

  it("shows an error state with a way back when loading fails", async () => {
    apiMock.getLibraryEntry.mockRejectedValueOnce(new Error("db gone"));
    renderDetail();
    expect(await screen.findByText(/db gone/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to library" }));
    expect(screen.getByText("library-page")).toBeInTheDocument();
  });

  it("ignores a stale response when navigating between entries", async () => {
    const slow = deferred<LibraryEntry>();
    apiMock.getLibraryEntry.mockReturnValueOnce(slow.promise);
    apiMock.getLibraryEntry.mockResolvedValueOnce(makeEntry({ id: 6, name: "Celeste" }));

    renderDetail();
    fireEvent.click(screen.getByText("nav:/game/6"));
    await screen.findByText("Celeste");

    slow.resolve(baseEntry()); // the old /game/5 response lands last
    await act(async () => {});
    expect(screen.getByText("Celeste")).toBeInTheDocument();
    expect(screen.queryByText("Hollow Knight")).toBeNull();
  });
});

describe("GameDetail — status, favourite, remove", () => {
  it("toggles the favourite through a patch and reflects the response", async () => {
    await renderLoaded();
    fireEvent.click(screen.getByTitle("Toggle favourite"));
    expect(apiMock.updateLibraryEntry).toHaveBeenCalledWith(5, { favourite: true });
    await waitFor(() => expect(screen.getByText("Favourited")).toBeInTheDocument());
  });

  it("patches the play status from the chips", async () => {
    await renderLoaded();
    fireEvent.click(screen.getByRole("button", { name: "Completed" }));
    expect(apiMock.updateLibraryEntry).toHaveBeenCalledWith(5, { status: "Completed" });
  });

  it("removes only after a second confirming click, then navigates away", async () => {
    apiMock.removeLibraryEntry.mockResolvedValueOnce(undefined);
    await renderLoaded();
    fireEvent.click(screen.getByTitle("Remove from library"));
    expect(screen.getByText("Click again to confirm")).toBeInTheDocument();
    expect(apiMock.removeLibraryEntry).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTitle("Remove from library"));
    expect(apiMock.removeLibraryEntry).toHaveBeenCalledWith(5);
    await waitFor(() => expect(screen.getByText("library-page")).toBeInTheDocument());
  });

  it("stays on the page with an error when removal fails", async () => {
    apiMock.removeLibraryEntry.mockRejectedValueOnce(new Error("still referenced"));
    await renderLoaded();
    fireEvent.click(screen.getByTitle("Remove from library"));
    fireEvent.click(screen.getByTitle("Remove from library"));
    expect(await screen.findByText(/still referenced/)).toBeInTheDocument();
    expect(screen.queryByText("library-page")).toBeNull();
  });
});

describe("GameDetail — hours played", () => {
  it("patches immediately when a preset is chosen", async () => {
    await renderLoaded();
    fireEvent.change(screen.getByDisplayValue("5+ hours"), { target: { value: "50" } });
    expect(apiMock.updateLibraryEntry).toHaveBeenCalledWith(5, { playtimeMinutes: 3000 });
  });

  it("patches 0 when 'Not tracked' is chosen", async () => {
    await renderLoaded();
    fireEvent.change(screen.getByDisplayValue("5+ hours"), { target: { value: "0" } });
    expect(apiMock.updateLibraryEntry).toHaveBeenCalledWith(5, { playtimeMinutes: 0 });
  });

  it("saves a custom value on blur, flooring fractional hours", async () => {
    await renderLoaded();
    fireEvent.change(screen.getByDisplayValue("5+ hours"), { target: { value: "custom" } });
    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "7.9" } });
    fireEvent.blur(input);
    expect(apiMock.updateLibraryEntry).toHaveBeenCalledWith(5, { playtimeMinutes: 420 });
  });

  it("snaps an exact preset value typed into the custom field back to the preset", async () => {
    await renderLoaded();
    fireEvent.change(screen.getByDisplayValue("5+ hours"), { target: { value: "custom" } });
    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "10" } });
    fireEvent.blur(input);
    expect(apiMock.updateLibraryEntry).toHaveBeenCalledWith(5, { playtimeMinutes: 600 });
    // custom input is gone — the value snapped to the "10+ hours" preset
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(screen.getByDisplayValue("10+ hours")).toBeInTheDocument();
  });

  it("clamps negative custom values to zero", async () => {
    await renderLoaded();
    fireEvent.change(screen.getByDisplayValue("5+ hours"), { target: { value: "custom" } });
    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "-5" } });
    fireEvent.blur(input);
    // a transient invalid edit restores the tracked value instead of zeroing it
    expect(apiMock.updateLibraryEntry).not.toHaveBeenCalled();
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(screen.getByDisplayValue("5+ hours")).toBeInTheDocument();
  });

  it("restores the tracked value when the custom field is cleared and blurred", async () => {
    await renderLoaded();
    fireEvent.change(screen.getByDisplayValue("5+ hours"), { target: { value: "custom" } });
    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(apiMock.updateLibraryEntry).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("5+ hours")).toBeInTheDocument();
  });
});

describe("GameDetail — dates", () => {
  it("commits a changed date on blur and skips unchanged ones", async () => {
    const { container } = await renderLoaded();
    const [started, finished] = container.querySelectorAll<HTMLInputElement>('input[type="date"]');
    expect(started).toBeTruthy();
    fireEvent.change(finished, { target: { value: "2020-03-15" } });
    fireEvent.blur(finished);
    expect(apiMock.updateLibraryEntry).toHaveBeenCalledWith(5, { finishedAt: "2020-03-15" });

    fireEvent.blur(started); // unchanged → no patch
    expect(apiMock.updateLibraryEntry).toHaveBeenCalledTimes(1);
  });

  it("rejects a started date after the finished date without patching", async () => {
    const { container } = await renderLoaded();
    const [started, finished] = container.querySelectorAll<HTMLInputElement>('input[type="date"]');
    fireEvent.change(started, { target: { value: "2021-01-01" } });
    fireEvent.blur(started);
    expect(screen.getByText("Started date cannot be after the Finished date.")).toBeInTheDocument();
    expect(apiMock.updateLibraryEntry).not.toHaveBeenCalled();

    // fixing the other side clears the error and patches
    fireEvent.change(finished, { target: { value: "2022-01-01" } });
    fireEvent.blur(finished);
    expect(apiMock.updateLibraryEntry).toHaveBeenCalledWith(5, { finishedAt: "2022-01-01" });
    expect(screen.queryByText(/cannot be after/)).toBeNull();
  });
});

describe("GameDetail — notes", () => {
  it("saves notes explicitly and clears the dirty flag on success", async () => {
    await renderLoaded();
    const textarea = screen.getByPlaceholderText(/Private notes/);
    fireEvent.change(textarea, { target: { value: "updated notes" } });
    expect(screen.getByRole("button", { name: "Save notes" })).toBeInTheDocument();
    // any unsaved change blocks the back button
    expect(screen.getByText("← Back")).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Save notes" }));
    await waitFor(() =>
      expect(apiMock.updateLibraryEntry).toHaveBeenCalledWith(5, { notes: "updated notes" }),
    );
    await waitFor(() => expect(screen.queryByRole("button", { name: "Save notes" })).toBeNull());
    expect(screen.getByText("← Back")).toBeEnabled();
  });

  it("keeps the page and the drafts alive when saving notes fails", async () => {
    apiMock.updateLibraryEntry.mockRejectedValueOnce(new Error("disk full"));
    await renderLoaded();
    fireEvent.change(screen.getByPlaceholderText(/Private notes/), {
      target: { value: "lost words" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save notes" }));

    // the failure surfaces as a banner; the editor stays mounted with the draft
    expect(await screen.findByText(/That didn’t save/)).toHaveTextContent("disk full");
    expect(screen.getByPlaceholderText(/Private notes/)).toHaveValue("lost words");
    expect(screen.getByRole("button", { name: "Save notes" })).toBeInTheDocument();
  });
});

describe("GameDetail — detailed score", () => {
  it("shows unset sliders at the 50 position but treats them as unset", async () => {
    await renderLoaded(); // gameplay=70 saved, others null
    const sliders = screen.getAllByRole("slider");
    expect(sliders[1]).toHaveValue("50"); // story unset → position 50
    expect(screen.getByText("Storytelling: not set")).toBeInTheDocument();
    expect(screen.getByText("Clear Gameplay")).toBeInTheDocument();
    // preview from the one saved category: 70 * (50/50) = 70.0
    expect(screen.getByText("70.0")).toBeInTheDocument();
  });

  it("previews the weighted overall and saves via setCategoryScores", async () => {
    await renderLoaded();
    const sliders = screen.getAllByRole("slider");
    fireEvent.change(sliders[0], { target: { value: "80" } });
    fireEvent.change(sliders[1], { target: { value: "60" } });
    // (80*50 + 60*25) / 75 = 73.3
    expect(screen.getByText("73.3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save score" }));
    expect(apiMock.setCategoryScores).toHaveBeenCalledWith(5, {
      gameplay: 80,
      story: 60,
      music: null,
      technical: null,
    });
    await waitFor(() => expect(screen.getByText("library-page")).toBeInTheDocument());
  });

  it("clears a category back to unset via its chip", async () => {
    await renderLoaded();
    fireEvent.click(screen.getByText("Clear Gameplay"));
    expect(screen.getByText("Gameplay: not set")).toBeInTheDocument();
    // all four categories unset plus the empty preview
    expect(screen.getAllByText("—").length).toBe(5);
  });

  it("returns to 'Saved' when the draft is reverted to the stored values", async () => {
    await renderLoaded();
    const sliders = screen.getAllByRole("slider");
    fireEvent.change(sliders[0], { target: { value: "85" } });
    expect(screen.getByRole("button", { name: "Save score" })).toBeEnabled();
    fireEvent.change(sliders[0], { target: { value: "70" } });
    expect(screen.getByRole("button", { name: "Saved" })).toBeDisabled();
  });

  it("saves both categories and notes when both are dirty", async () => {
    await renderLoaded();
    fireEvent.change(screen.getAllByRole("slider")[0], { target: { value: "80" } });
    fireEvent.change(screen.getByPlaceholderText(/Private notes/), {
      target: { value: "both dirty" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save score" }));

    await waitFor(() =>
      expect(apiMock.setCategoryScores).toHaveBeenCalledWith(5, {
        gameplay: 80,
        story: null,
        music: null,
        technical: null,
      }),
    );
    await waitFor(() =>
      expect(apiMock.updateLibraryEntry).toHaveBeenCalledWith(5, { notes: "both dirty" }),
    );
    await waitFor(() => expect(screen.getByText("library-page")).toBeInTheDocument());
  });

  it("stays on the page and shows an error when the score save fails", async () => {
    apiMock.setCategoryScores.mockRejectedValueOnce(new Error("write refused"));
    await renderLoaded();
    fireEvent.change(screen.getAllByRole("slider")[0], { target: { value: "80" } });
    fireEvent.click(screen.getByRole("button", { name: "Save score" }));
    expect(await screen.findByText(/write refused/)).toBeInTheDocument();
    expect(screen.queryByText("library-page")).toBeNull();
  });
});

describe("GameDetail — quick rating and divergence", () => {
  it("saves a star rating through the picker", async () => {
    apiMock.setStarRating.mockResolvedValueOnce(makeEntry({ id: 5, starRating: 4.5 }));
    await renderLoaded();
    fireEvent.click(screen.getByLabelText("4.5 stars"));
    expect(apiMock.setStarRating).toHaveBeenCalledWith(5, 4.5);
    await waitFor(() => expect(screen.getByText("4.5 / 5")).toBeInTheDocument());
  });

  it("shows the divergence panel only when both ratings exist", async () => {
    await renderLoaded(); // stars 4, overall 62.5 → +17.5 gut-feeling
    expect(screen.getByText(/well above your detailed score/)).toBeInTheDocument();

    apiMock.setStarRating.mockResolvedValueOnce(makeEntry({ id: 5, starRating: null }));
    fireEvent.click(screen.getByLabelText("4 stars")); // clears to null
    await waitFor(() => expect(screen.queryByText(/well above your detailed score/)).toBeNull());
  });
});
