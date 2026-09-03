import { useEffect, useRef, useState } from "react";
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useApp } from "./store";
import { api } from "./api";
import { applyTheme } from "./lib/themes";
import Onboarding from "./pages/Onboarding";
import Search from "./pages/Search";
import Library from "./pages/Library";
import GameDetail from "./pages/GameDetail";
import Dashboard from "./pages/Dashboard";
import RerateMode from "./pages/RerateMode";
import SettingsModal from "./components/SettingsModal";
import {
  ChartIcon,
  GameIcon,
  GearIcon,
  GridIcon,
  RefreshIcon,
  SearchIcon,
} from "./components/icons";

function SidebarUsername() {
  const { profile, setProfile } = useApp();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  // Ref-based guard: handlers captured by onBlur survive into the commit that
  // unmounts the input, so a state check alone is not closure-proof.
  const busyRef = useRef(false);

  if (!profile) return null;

  function startEdit() {
    setValue(profile!.username);
    setEditing(true);
  }

  async function save() {
    if (busyRef.current) return;
    const next = value.trim();
    setEditing(false);
    if (!next || next === profile!.username) return;
    busyRef.current = true;
    setBusy(true);
    try {
      setProfile(await api.renameProfile(next));
    } catch {
      /* keep old name on failure */
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <input
        autoFocus
        className="mt-2 w-full px-3 py-1.5 text-xs bg-surface-800 border border-accent-500 rounded-lg text-slate-200 outline-none"
        maxLength={32}
        value={value}
        disabled={busy}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setEditing(false);
        }}
      />
    );
  }

  return (
    <div className="group/name mt-2 px-3 py-2 text-xs text-slate-500">
      Signed in locally as{" "}
      <button
        className="text-slate-300 font-medium underline-offset-2 group-hover/name:underline hover:text-white transition-colors"
        onClick={startEdit}
        title="Click to rename"
      >
        {profile.username}
      </button>
      <span className="opacity-0 group-hover/name:opacity-100 transition-opacity text-accent-400 ml-1">✎</span>
    </div>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const profile = useApp((s) => s.profile);
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
                    ? "bg-accent-600/20 text-accent-400"
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
          {profile && <SidebarUsername />}
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">{children}</main>
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

export default function App() {
  const { profile, profileLoading, loadProfile, loadApiKeyStatus, loadSettings } = useApp();
  const settings = useApp((s) => s.settings);

  useEffect(() => {
    loadProfile();
    loadApiKeyStatus();
    loadSettings();
  }, [loadProfile, loadApiKeyStatus, loadSettings]);

  useEffect(() => {
    applyTheme(settings.theme, settings.customTheme);
  }, [settings]);

  if (profileLoading) {
    return (
      <div className="h-full flex items-center justify-center text-slate-500">
        Loading GameTracker…
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
