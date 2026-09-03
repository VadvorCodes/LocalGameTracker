import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./api", async () => {
  const m = await import("./test/apiMock");
  return { api: m.apiMock, localCover: m.localCoverMock };
});

import { apiMock, localCoverMock } from "./test/apiMock";
import { useApp } from "./store";
import App from "./App";
import { makeAnalytics, makeEntry, makeProfile } from "./test/utils";

/** App owns its BrowserRouter; jsdom's URL decides the entry route. */
function at(path: string) {
  window.history.replaceState(null, "", path);
}

/** Unique sidebar marker — the app chrome (with a profile) has finished mounting. */
function appReady() {
  return screen.findByText(/Signed in locally as/);
}

beforeEach(() => {
  vi.resetAllMocks();
  window.localStorage.clear();
  document.documentElement.style.cssText = "";
  at("/");
  const profile = makeProfile();
  apiMock.getProfile.mockResolvedValue(profile);
  apiMock.getApiKey.mockResolvedValue({ hasKey: true });
  apiMock.getSettings.mockResolvedValue({
    theme: "midnight",
    customTheme: null,
    extendedSorting: false,
  });
  apiMock.libraryQuery.mockResolvedValue([]);
  apiMock.getGenresAndPlatforms.mockResolvedValue({ genres: [], platforms: [] });
  apiMock.getAnalytics.mockResolvedValue(makeAnalytics());
  localCoverMock.mockResolvedValue(null);
  useApp.setState({
    profile: null,
    profileLoading: true,
    hasApiKey: true,
    settings: { theme: "midnight", customTheme: null, extendedSorting: false },
  });
});

describe("App — boot sequence", () => {
  it("shows the loading screen while the profile is being fetched", () => {
    apiMock.getProfile.mockReturnValueOnce(new Promise(() => {}));
    render(<App />);
    expect(screen.getByText("Loading GameTracker…")).toBeInTheDocument();
  });

  it("boots the profile, API-key status and settings on mount", async () => {
    render(<App />);
    await appReady();
    expect(apiMock.getProfile).toHaveBeenCalledTimes(1);
    expect(apiMock.getApiKey).toHaveBeenCalledTimes(1);
    expect(apiMock.getSettings).toHaveBeenCalledTimes(1);
  });

  it("shows Onboarding (without the app chrome) when no profile exists", async () => {
    apiMock.getProfile.mockResolvedValueOnce(null);
    render(<App />);
    expect(await screen.findByText("Welcome to GameTracker")).toBeInTheDocument();
    // the sidebar is not mounted yet
    expect(screen.queryByText(/Signed in locally as/)).toBeNull();
    expect(screen.queryByText("Re-Rate Mode")).toBeNull();
  });

  it("applies the persisted theme to the document root on boot", async () => {
    apiMock.getSettings.mockResolvedValueOnce({
      theme: "ocean",
      customTheme: null,
      extendedSorting: false,
    });
    render(<App />);
    await appReady();
    expect(document.documentElement.style.getPropertyValue("--surface-950")).toBe("6 16 22");
    expect(document.documentElement.style.getPropertyValue("--accent-500")).toBe("34 190 216");
  });

  it("re-applies the theme when settings change later", async () => {
    render(<App />);
    await appReady();
    expect(document.documentElement.style.getPropertyValue("--accent-500")).toBe("91 124 250");
    await act(async () => {
      useApp.setState({
        settings: { theme: "crimson", customTheme: null, extendedSorting: false },
      });
    });
    expect(document.documentElement.style.getPropertyValue("--accent-500")).toBe("232 68 96");
  });
});

describe("App — routing", () => {
  it("lands on the library from /", async () => {
    at("/");
    render(<App />);
    await appReady();
    expect(await screen.findByPlaceholderText("Filter by name…")).toBeInTheDocument();
  });

  it("redirects unknown routes to the library", async () => {
    at("/definitely-not-a-route");
    render(<App />);
    await appReady();
    expect(await screen.findByPlaceholderText("Filter by name…")).toBeInTheDocument();
  });

  it("renders the dashboard route", async () => {
    at("/dashboard");
    render(<App />);
    expect(await screen.findByText("My gaming dashboard")).toBeInTheDocument();
  });

  it("renders the game detail route", async () => {
    at("/game/7");
    apiMock.getLibraryEntry.mockResolvedValueOnce(makeEntry({ id: 7, name: "Celeste" }));
    render(<App />);
    expect(await screen.findByText("Celeste")).toBeInTheDocument();
    expect(apiMock.getLibraryEntry).toHaveBeenCalledWith(7);
  });

  it("highlights the active nav link", async () => {
    at("/dashboard");
    render(<App />);
    await screen.findByText("My gaming dashboard");
    expect(screen.getByText("Dashboard")).toHaveClass("bg-accent-600/20");
    expect(screen.getByText("Library")).not.toHaveClass("bg-accent-600/20");
  });

  it("navigates between sections from the sidebar", async () => {
    render(<App />);
    await appReady();
    fireEvent.click(screen.getByText("Search"));
    expect(await screen.findByText("Find games")).toBeInTheDocument();
    expect(screen.getByText("Search")).toHaveClass("bg-accent-600/20");
  });
});

describe("App — settings modal", () => {
  it("opens from the sidebar and closes again", async () => {
    render(<App />);
    await appReady();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(await screen.findByText("RAWG API key")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByText("RAWG API key")).toBeNull();
  });
});

describe("App — sidebar username", () => {
  async function openRename() {
    const { container } = render(<App />);
    await appReady();
    fireEvent.click(within(container.querySelector("aside")!).getByTitle("Click to rename"));
    // scoped to the sidebar: the Library page also renders a text input
    return within(container.querySelector("aside")!).getByRole("textbox") as HTMLInputElement;
  }

  it("renames on Enter and updates the store", async () => {
    const renamed = makeProfile({ username: "renamed-user" });
    apiMock.renameProfile.mockResolvedValueOnce(renamed);
    const input = await openRename();
    expect(input).toHaveValue("tester");
    fireEvent.change(input, { target: { value: "renamed-user" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(apiMock.renameProfile).toHaveBeenCalledTimes(1); // no blur double-fire
    expect(apiMock.renameProfile).toHaveBeenCalledWith("renamed-user");
    await waitFor(() => expect(useApp.getState().profile?.username).toBe("renamed-user"));
    // input is gone, the new name is displayed
    expect(screen.getByText("renamed-user")).toBeInTheDocument();
    expect(within(document.querySelector("aside")!).queryByRole("textbox")).toBeNull();
  });

  it("renames on blur", async () => {
    apiMock.renameProfile.mockResolvedValueOnce(makeProfile({ username: "blur-name" }));
    const input = await openRename();
    fireEvent.change(input, { target: { value: "blur-name" } });
    fireEvent.blur(input);
    await waitFor(() => expect(useApp.getState().profile?.username).toBe("blur-name"));
  });

  it("does not call the API when the name is unchanged or empty", async () => {
    const input = await openRename();
    fireEvent.blur(input); // unchanged
    expect(apiMock.renameProfile).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTitle("Click to rename"));
    const aside = document.querySelector("aside")!;
    const again = within(aside).getByRole("textbox") as HTMLInputElement;
    fireEvent.change(again, { target: { value: "   " } });
    fireEvent.keyDown(again, { key: "Enter" });
    expect(apiMock.renameProfile).not.toHaveBeenCalled();
  });

  it("cancels editing on Escape without calling the API", async () => {
    const input = await openRename();
    fireEvent.change(input, { target: { value: "never-saved" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(apiMock.renameProfile).not.toHaveBeenCalled();
    expect(within(document.querySelector("aside")!).queryByRole("textbox")).toBeNull();
    expect(screen.getByText("tester")).toBeInTheDocument();
  });

  it("silently keeps the old name when renaming fails", async () => {
    apiMock.renameProfile.mockRejectedValueOnce(new Error("taken"));
    const input = await openRename();
    fireEvent.change(input, { target: { value: "taken" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(apiMock.renameProfile).toHaveBeenCalled());
    expect(useApp.getState().profile?.username).toBe("tester");
    expect(screen.getByText("tester")).toBeInTheDocument();
  });
});
