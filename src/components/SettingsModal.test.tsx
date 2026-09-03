import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("../api", async () => {
  const m = await import("../test/apiMock");
  return { api: m.apiMock, localCover: m.localCoverMock };
});

import { apiMock } from "../test/apiMock";
import { useApp } from "../store";
import SettingsModal from "./SettingsModal";
import { makeProfile } from "../test/utils";
import type { UiSettings } from "../types";

const MIDNIGHT_ACCENT_500 = "91 124 250";
const OCEAN_ACCENT_500 = "34 190 216";

function resetStore(overrides: Record<string, unknown> = {}) {
  useApp.setState({
    profile: makeProfile(),
    profileLoading: false,
    hasApiKey: true,
    settings: { theme: "midnight", customTheme: null, extendedSorting: false } satisfies UiSettings,
    ...overrides,
  });
}

function renderModal() {
  const onClose = vi.fn();
  const view = render(<SettingsModal onClose={onClose} />);
  return { onClose, ...view };
}

function openCustomisationTab() {
  fireEvent.click(screen.getByRole("button", { name: "Customisation" }));
}

beforeEach(() => {
  vi.resetAllMocks();
  document.documentElement.style.cssText = "";
  resetStore();
});

describe("SettingsModal shell", () => {
  it("opens on the General tab and switches to Customisation", () => {
    renderModal();
    expect(screen.getByText("RAWG API key")).toBeInTheDocument();
    expect(screen.queryByText("Colour theme")).toBeNull();

    openCustomisationTab();
    expect(screen.getByText("Colour theme")).toBeInTheDocument();
    expect(screen.getByText("Username")).toBeInTheDocument();
  });

  it("closes via the Close button and a backdrop click, but not inner clicks", () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close when clicking inside the card", () => {
    const { onClose, container } = renderModal();
    fireEvent.click(container.querySelector(".card")!);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes when clicking the dark backdrop", () => {
    const { onClose, container } = renderModal();
    fireEvent.click(container.firstElementChild!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("General tab — RAWG API key", () => {
  it("describes the current key status", () => {
    const { unmount } = renderModal();
    expect(screen.getByText(/A key is configured/)).toBeInTheDocument();
    unmount();

    resetStore({ hasApiKey: false });
    renderModal();
    expect(screen.getByText(/No key set/)).toBeInTheDocument();
  });

  it("disables Save while the input is empty", () => {
    renderModal();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("saves a key, clears the input and refreshes the key status", async () => {
    apiMock.setApiKey.mockResolvedValueOnce({ hasKey: true });
    apiMock.getApiKey.mockResolvedValueOnce({ hasKey: true });
    renderModal();
    const input = screen.getByPlaceholderText("RAWG API key");
    fireEvent.change(input, { target: { value: "rawg-key-123" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(apiMock.setApiKey).toHaveBeenCalledWith("rawg-key-123");
    await waitFor(() => expect(input).toHaveValue(""));
    await waitFor(() => expect(useApp.getState().hasApiKey).toBe(true));
    expect(apiMock.getApiKey).toHaveBeenCalled();
  });

  it("shows an error and keeps the input when saving fails", async () => {
    apiMock.setApiKey.mockRejectedValueOnce(new Error("invalid key"));
    renderModal();
    const input = screen.getByPlaceholderText("RAWG API key");
    fireEvent.change(input, { target: { value: "bad" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByText(/invalid key/)).toBeInTheDocument());
    expect(input).toHaveValue("bad");
  });

  it("shows a Validating label while saving", () => {
    apiMock.setApiKey.mockReturnValueOnce(new Promise(() => {})); // never settles
    renderModal();
    fireEvent.change(screen.getByPlaceholderText("RAWG API key"), { target: { value: "k" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("button", { name: "Validating…" })).toBeDisabled();
  });

  it("only offers Clear when a key exists, and clears it", async () => {
    apiMock.setApiKey.mockResolvedValueOnce({ hasKey: false });
    apiMock.getApiKey.mockResolvedValueOnce({ hasKey: false });
    const { rerender } = renderModal();
    expect(screen.getByRole("button", { name: "Clear" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(apiMock.setApiKey).toHaveBeenCalledWith("");
    await waitFor(() => expect(useApp.getState().hasApiKey).toBe(false));

    resetStore({ hasApiKey: false });
    rerender(<SettingsModal onClose={() => {}} />);
    expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
  });
});

describe("General tab — extended sorting", () => {
  it("toggles optimistically and persists", async () => {
    apiMock.setExtendedSorting.mockResolvedValueOnce({});
    renderModal();
    const chip = screen.getByRole("button", { name: "Off" });
    fireEvent.click(chip);

    expect(useApp.getState().settings.extendedSorting).toBe(true);
    expect(apiMock.setExtendedSorting).toHaveBeenCalledWith(true);
    await waitFor(() => expect(screen.getByRole("button", { name: "On" })).toBeInTheDocument());
  });

  it("rolls the store back and shows an error when persisting fails", async () => {
    apiMock.setExtendedSorting.mockRejectedValueOnce(new Error("disk full"));
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Off" }));

    expect(useApp.getState().settings.extendedSorting).toBe(true); // optimistic
    await waitFor(() => expect(screen.getByText(/disk full/)).toBeInTheDocument());
    expect(useApp.getState().settings.extendedSorting).toBe(false); // rolled back
  });

  it("ignores clicks while a toggle is in flight", async () => {
    apiMock.setExtendedSorting.mockReturnValueOnce(new Promise(() => {}));
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Off" }));
    fireEvent.click(screen.getByRole("button", { name: "On" }));
    expect(apiMock.setExtendedSorting).toHaveBeenCalledTimes(1);
  });
});

describe("General tab — weights", () => {
  it("validates that weights total exactly 100 before saving", () => {
    renderModal();
    const total = screen.getByText(/Current total:/);
    expect(total.textContent).toContain("100 / 100");
    const save = screen.getByRole("button", { name: "Save weights" });
    expect(save).toBeEnabled();

    const sliders = screen.getAllByRole("slider");
    fireEvent.change(sliders[0], { target: { value: "30" } });
    expect(total.textContent).toContain("105 / 100");
    expect(screen.getByText(/must total exactly 100/)).toBeInTheDocument();
    expect(save).toBeDisabled();

    fireEvent.change(sliders[0], { target: { value: "25" } });
    expect(total.textContent).toContain("100 / 100");
    expect(save).toBeEnabled();
  });

  it("saves weights and refreshes the profile", async () => {
    const updated = makeProfile({
      username: "tester",
      categoryWeights: { gameplay: 20, story: 30, music: 25, technical: 25 },
    });
    apiMock.updateWeights.mockResolvedValueOnce(undefined);
    apiMock.getProfile.mockResolvedValueOnce(updated);
    renderModal();
    const sliders = screen.getAllByRole("slider");
    fireEvent.change(sliders[0], { target: { value: "20" } }); // 95
    fireEvent.change(sliders[1], { target: { value: "30" } }); // 100
    fireEvent.click(screen.getByRole("button", { name: "Save weights" }));

    expect(apiMock.updateWeights).toHaveBeenCalledWith({
      gameplay: 20,
      story: 30,
      music: 25,
      technical: 25,
    });
    expect(
      await screen.findByText(/Weights saved — all detailed scores were recomputed/),
    ).toBeInTheDocument();
    expect(useApp.getState().profile).toEqual(updated);
  });

  it("reports weight-save failures in the message line", async () => {
    apiMock.updateWeights.mockRejectedValueOnce(new Error("nope"));
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Save weights" }));
    expect(await screen.findByText(/nope/)).toBeInTheDocument();
  });
});

describe("Customisation tab — username", () => {
  it("disables Save while the name is unchanged or blank", () => {
    renderModal();
    openCustomisationTab();
    const input = screen.getByPlaceholderText("Username");
    const save = screen.getByRole("button", { name: "Save" });
    expect(input).toHaveValue("tester");
    expect(save).toBeDisabled();

    fireEvent.change(input, { target: { value: "   " } });
    expect(save).toBeDisabled();

    fireEvent.change(input, { target: { value: "tester2" } });
    expect(save).toBeEnabled();
  });

  it("renames via the Save button and updates the store", async () => {
    apiMock.renameProfile.mockResolvedValueOnce(makeProfile({ username: "renamed" }));
    renderModal();
    openCustomisationTab();
    const input = screen.getByPlaceholderText("Username");
    fireEvent.change(input, { target: { value: "renamed" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(apiMock.renameProfile).toHaveBeenCalledWith("renamed");
    await waitFor(() => expect(useApp.getState().profile?.username).toBe("renamed"));
    await waitFor(() => expect(input).toHaveValue("renamed"));
  });

  it("renames on Enter and shows errors on failure", async () => {
    renderModal();
    openCustomisationTab();
    const input = screen.getByPlaceholderText("Username");
    fireEvent.change(input, { target: { value: "entername" } });

    apiMock.renameProfile.mockRejectedValueOnce(new Error("taken"));
    fireEvent.keyDown(input, { key: "Enter" });
    expect(apiMock.renameProfile).toHaveBeenCalledWith("entername");
    await waitFor(() => expect(screen.getByText(/taken/)).toBeInTheDocument());
  });
});

describe("Customisation tab — themes", () => {
  it("lists the six presets plus Custom", () => {
    renderModal();
    openCustomisationTab();
    for (const name of ["Midnight", "Ocean", "Forest", "Sunset", "Violet", "Crimson", "Custom"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("applies a preset's CSS immediately and persists it", async () => {
    apiMock.setTheme.mockImplementationOnce(async (theme: string) => ({
      theme,
      customTheme: null,
      extendedSorting: false,
    }));
    renderModal();
    openCustomisationTab();
    fireEvent.click(screen.getByRole("button", { name: /Ocean/ }));

    // applied before the await resolves
    expect(document.documentElement.style.getPropertyValue("--accent-500")).toBe(OCEAN_ACCENT_500);
    expect(apiMock.setTheme).toHaveBeenCalledWith("ocean");
    await waitFor(() => expect(useApp.getState().settings.theme).toBe("ocean"));
  });

  it("reverts the CSS on a failed preset save", async () => {
    apiMock.setTheme.mockRejectedValueOnce(new Error("write failed"));
    renderModal();
    openCustomisationTab();
    fireEvent.click(screen.getByRole("button", { name: /Ocean/ }));

    await waitFor(() => expect(screen.getByText(/write failed/)).toBeInTheDocument());
    expect(document.documentElement.style.getPropertyValue("--accent-500")).toBe(
      MIDNIGHT_ACCENT_500,
    );
    expect(useApp.getState().settings.theme).toBe("midnight");
  });

  it("activates the custom theme with saved colours, or defaults", async () => {
    apiMock.setCustomTheme.mockImplementationOnce(async (base: string, accent: string) => ({
      theme: "custom",
      customTheme: { base, accent },
      extendedSorting: false,
    }));
    renderModal();
    openCustomisationTab();
    fireEvent.click(screen.getByRole("button", { name: "Custom" }));

    expect(apiMock.setCustomTheme).toHaveBeenCalledWith("#0b0e14", "#5b7cfa"); // defaults
    await waitFor(() => expect(useApp.getState().settings.theme).toBe("custom"));
    // the editor appears once the custom theme is active
    expect(document.querySelectorAll('input[type="color"]').length).toBe(2);
  });

  it("marks the active preset visually", () => {
    resetStore({ settings: { theme: "forest", customTheme: null, extendedSorting: false } });
    renderModal();
    openCustomisationTab();
    expect(screen.getByRole("button", { name: /Forest/ })).toHaveClass("border-accent-500/60");
    expect(screen.getByRole("button", { name: /Ocean/ })).not.toHaveClass("border-accent-500/60");
  });

  it("persists edits settled by the custom colour editor", async () => {
    resetStore({
      settings: {
        theme: "custom",
        customTheme: { base: "#0b0e14", accent: "#5b7cfa" },
        extendedSorting: false,
      },
    });
    apiMock.setCustomTheme.mockResolvedValueOnce({
      theme: "custom",
      customTheme: { base: "#102030", accent: "#5b7cfa" },
      extendedSorting: false,
    });

    // The editor debounces 400ms and coalesces via rAF — control both.
    let rafQueue: (FrameRequestCallback | null)[] = [];
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      rafQueue.push(cb);
      return rafQueue.length - 1;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      rafQueue[id] = null;
    });
    try {
      renderModal();
      openCustomisationTab();
      const colourInput = document.querySelector<HTMLInputElement>('input[type="color"]')!;
      expect(colourInput.value).toBe("#0b0e14");
      fireEvent.change(colourInput, { target: { value: "#102030" } });
      rafQueue.forEach((cb) => cb?.(0));
      rafQueue = [];
      vi.advanceTimersByTime(400);

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(apiMock.setCustomTheme).toHaveBeenCalledWith("#102030", "#5b7cfa");
      expect(useApp.getState().settings.customTheme).toEqual({
        base: "#102030",
        accent: "#5b7cfa",
      });
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it("rolls the custom theme back when the settle persist fails", async () => {
    resetStore({
      settings: {
        theme: "custom",
        customTheme: { base: "#0b0e14", accent: "#5b7cfa" },
        extendedSorting: false,
      },
    });
    apiMock.setCustomTheme.mockRejectedValueOnce(new Error("boom"));

    let rafQueue: (FrameRequestCallback | null)[] = [];
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      rafQueue.push(cb);
      return rafQueue.length - 1;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      rafQueue[id] = null;
    });
    try {
      renderModal();
      openCustomisationTab();
      const colourInput = document.querySelector<HTMLInputElement>('input[type="color"]')!;
      fireEvent.change(colourInput, { target: { value: "#102030" } });
      rafQueue.forEach((cb) => cb?.(0));
      rafQueue = [];
      vi.advanceTimersByTime(400);

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(useApp.getState().settings.customTheme).toEqual({
        base: "#0b0e14",
        accent: "#5b7cfa",
      });
      expect(document.documentElement.style.getPropertyValue("--surface-950")).toBe("11 14 20");
      expect(screen.getByText(/boom/)).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });
});
