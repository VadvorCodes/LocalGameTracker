import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./api", async () => {
  const m = await import("./test/apiMock");
  return { api: m.apiMock };
});

import { apiMock } from "./test/apiMock";
import { useApp } from "./store";
import { makeProfile } from "./test/utils";
import type { UiSettings } from "./types";

const DEFAULT_SETTINGS: UiSettings = {
  theme: "midnight",
  customTheme: null,
  extendedSorting: false,
};

beforeEach(() => {
  useApp.setState({
    profile: null,
    profileLoading: true,
    hasApiKey: true,
    settings: DEFAULT_SETTINGS,
  });
});

describe("loadProfile", () => {
  it("stores an existing profile and clears the loading flag", async () => {
    const profile = makeProfile();
    apiMock.getProfile.mockResolvedValueOnce(profile);
    await useApp.getState().loadProfile();
    expect(useApp.getState().profile).toEqual(profile);
    expect(useApp.getState().profileLoading).toBe(false);
  });

  it("keeps profile null (onboarding path) when the backend has none", async () => {
    apiMock.getProfile.mockResolvedValueOnce(null);
    await useApp.getState().loadProfile();
    expect(useApp.getState().profile).toBeNull();
    expect(useApp.getState().profileLoading).toBe(false);
  });

  it("treats an error as 'no profile' and clears the loading flag", async () => {
    apiMock.getProfile.mockRejectedValueOnce(new Error("boom"));
    await useApp.getState().loadProfile();
    expect(useApp.getState().profile).toBeNull();
    expect(useApp.getState().profileLoading).toBe(false);
  });
});

describe("loadApiKeyStatus", () => {
  it("mirrors the backend's hasKey flag", async () => {
    apiMock.getApiKey.mockResolvedValueOnce({ hasKey: false });
    await useApp.getState().loadApiKeyStatus();
    expect(useApp.getState().hasApiKey).toBe(false);

    apiMock.getApiKey.mockResolvedValueOnce({ hasKey: true });
    await useApp.getState().loadApiKeyStatus();
    expect(useApp.getState().hasApiKey).toBe(true);
  });

  it("swallows errors and keeps the previous flag", async () => {
    apiMock.getApiKey.mockRejectedValueOnce(new Error("boom"));
    await useApp.getState().loadApiKeyStatus();
    expect(useApp.getState().hasApiKey).toBe(true);
  });
});

describe("loadSettings", () => {
  it("replaces the default settings with persisted ones", async () => {
    const settings: UiSettings = {
      theme: "ocean",
      customTheme: { base: "#111111", accent: "#ff0000" },
      extendedSorting: true,
    };
    apiMock.getSettings.mockResolvedValueOnce(settings);
    await useApp.getState().loadSettings();
    expect(useApp.getState().settings).toEqual(settings);
  });

  it("keeps defaults on error", async () => {
    apiMock.getSettings.mockRejectedValueOnce(new Error("boom"));
    await useApp.getState().loadSettings();
    expect(useApp.getState().settings).toEqual(DEFAULT_SETTINGS);
  });
});

describe("plain setters", () => {
  it("setProfile / setSettings update state directly", () => {
    const profile = makeProfile({ username: "zed" });
    useApp.getState().setProfile(profile);
    expect(useApp.getState().profile).toBe(profile);

    const settings: UiSettings = { theme: "violet", customTheme: null, extendedSorting: false };
    useApp.getState().setSettings(settings);
    expect(useApp.getState().settings).toBe(settings);
  });
});
