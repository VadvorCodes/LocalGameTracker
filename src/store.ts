import { create } from "zustand";
import { api } from "./api";
import type { Profile } from "./types";

interface AppState {
  profile: Profile | null;
  profileLoading: boolean;
  hasApiKey: boolean;
  loadProfile: () => Promise<void>;
  loadApiKeyStatus: () => Promise<void>;
  setProfile: (p: Profile | null) => void;
}

export const useApp = create<AppState>((set) => ({
  profile: null,
  profileLoading: true,
  hasApiKey: true,
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
  setProfile: (p) => set({ profile: p }),
}));
