import { create } from "zustand";
import { api } from "./api";
import { DEFAULT_THEME_ID } from "./lib/themes";
import { isThemeId } from "./types";
import type { Profile, UiSettings } from "./types";

const DEFAULT_SETTINGS: UiSettings = {
  theme: "midnight",
  customTheme: null,
  extendedSorting: false,
};

interface AppState {
  profile: Profile | null;
  profileLoading: boolean;
  hasApiKey: boolean;
  settings: UiSettings;
  loadProfile: () => Promise<void>;
  loadApiKeyStatus: () => Promise<void>;
  loadSettings: () => Promise<void>;
  setProfile: (p: Profile | null) => void;
  setSettings: (s: UiSettings) => void;
}

export const useApp = create<AppState>((set) => ({
  profile: null,
  profileLoading: true,
  hasApiKey: true,
  settings: DEFAULT_SETTINGS,
  loadProfile: async () => {
    try {
      const p = await api.getProfile();
      set({ profile: p, profileLoading: false });
    } catch {
      set({ profile: null, profileLoading: false });
    }
  },
  loadApiKeyStatus: async () => {
    try {
      const { hasKey } = await api.getApiKey();
      set({ hasApiKey: hasKey });
    } catch {
      /* non-fatal */
    }
  },
  loadSettings: async () => {
    try {
      const s = await api.getSettings();
      // Backend JSON may carry any string (older/newer build) — coerce unknown theme ids to the default.
      set({ settings: { ...s, theme: isThemeId(s.theme) ? s.theme : DEFAULT_THEME_ID } });
    } catch {
      /* keep defaults */
    }
  },
  setProfile: (p) => set({ profile: p }),
  setSettings: (s) => set({ settings: s }),
}));
