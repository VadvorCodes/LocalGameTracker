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
  /** Set when reading the profile failed — a failed read is not "no profile". */
  profileError: string | null;
  /**
   * Whether the backend has a RAWG key. Starts false (the honest unknown:
   * claiming a key exists would suppress Search's "no key" banner) and keeps
   * its last known value when a re-check fails.
   */
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
  profileError: null,
  hasApiKey: false,
  settings: DEFAULT_SETTINGS,
  loadProfile: async () => {
    set({ profileLoading: true, profileError: null });
    try {
      const p = await api.getProfile();
      set({ profile: p, profileLoading: false });
    } catch (e) {
      // Keep whatever profile we had: routing an existing user to Onboarding
      // would have them create a second profile over a busy backend.
      set({ profileError: String(e), profileLoading: false });
    }
  },
  loadApiKeyStatus: async () => {
    try {
      const { hasKey } = await api.getApiKey();
      set({ hasApiKey: hasKey });
    } catch {
      /* non-fatal: keep the last known flag */
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
