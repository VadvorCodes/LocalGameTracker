import { useEffect, useState } from "react";
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useApp } from "./store";
import { applyTheme } from "./lib/themes";
import Onboarding from "./pages/Onboarding";
import Search from "./pages/Search";
import Library from "./pages/Library";
import GameDetail from "./pages/GameDetail";
import Dashboard from "./pages/Dashboard";
import RerateMode from "./pages/RerateMode";
import SettingsModal from "./components/SettingsModal";
import SidebarUsername from "./components/SidebarUsername";
import {
  ChartIcon,
  GameIcon,
  GearIcon,
  GridIcon,
  RefreshIcon,
  SearchIcon,
} from "./components/icons";

function Layout({ children }: { children: React.ReactNode }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const location = useLocation();

  const nav = [
    { to: "/search", label: "Search", icon: <SearchIcon /> },
    { to: "/library", label: "Library", icon: <GridIcon /> },
    { to: "/dashboard", label: "Dashboard", icon: <ChartIcon /> },
    { to: "/rerate", label: "Re-Rate Mode", icon: <RefreshIcon /> },
  ];

  return (
    <div className="flex h-full">
      <aside className="w-56 shrink-0 bg-surface-900 border-r border-surface-700/60 flex flex-col">
        <div className="flex items-center gap-2.5 px-5 h-16 border-b border-surface-700/60">
          <Link to="/library" className="flex items-center gap-2.5" title="Go to library">
            <GameIcon />
            <span className="font-semibold text-lg tracking-tight text-white">GameTracker</span>
          </Link>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {nav.map((n) => {
            const active = location.pathname.startsWith(n.to);
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "chip-active"
                    : "text-slate-400 hover:bg-surface-800 hover:text-slate-200"
                }`}
              >
                {n.icon}
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-surface-700/60">
          <button
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-400 hover:bg-surface-800 hover:text-slate-200 transition-colors"
            onClick={() => setSettingsOpen(true)}
          >
            <GearIcon />
            Settings
          </button>
          <SidebarUsername />
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">{children}</main>
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

export default function App() {
  // Per-field selectors: App must not re-render on unrelated store changes
  // (e.g. hasApiKey, or extendedSorting for the theme effect).
  const profile = useApp((s) => s.profile);
  const profileLoading = useApp((s) => s.profileLoading);
  const profileError = useApp((s) => s.profileError);
  const loadProfile = useApp((s) => s.loadProfile);
  const loadApiKeyStatus = useApp((s) => s.loadApiKeyStatus);
  const loadSettings = useApp((s) => s.loadSettings);
  const theme = useApp((s) => s.settings.theme);
  const customTheme = useApp((s) => s.settings.customTheme);

  useEffect(() => {
    loadProfile();
    loadApiKeyStatus();
    loadSettings();
  }, [loadProfile, loadApiKeyStatus, loadSettings]);

  useEffect(() => {
    applyTheme(theme, customTheme);
  }, [theme, customTheme]);

  if (profileLoading) {
    return (
      <div className="h-full flex items-center justify-center text-slate-500">
        Loading GameTracker…
      </div>
    );
  }
  if (profileError) {
    // The profile read failed (busy backend, DB error) — offer a retry instead
    // of the Onboarding flow, which would try to create a duplicate profile.
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 text-slate-400">
        <p>Couldn’t reach your library: {profileError}</p>
        <button className="btn-primary" onClick={() => void loadProfile()}>
          Retry
        </button>
      </div>
    );
  }
  if (!profile) return <Onboarding />;

  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/library" replace />} />
          <Route path="/search" element={<Search />} />
          <Route path="/library" element={<Library />} />
          <Route path="/game/:id" element={<GameDetail />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/rerate" element={<RerateMode />} />
          <Route path="*" element={<Navigate to="/library" replace />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
