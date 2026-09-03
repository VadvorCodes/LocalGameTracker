import { useCallback, useState } from "react";
import { api } from "../api";
import { useApp } from "../store";
import {
  applyTheme,
  CUSTOM_THEME_ID,
  DEFAULT_CUSTOM_COLOURS,
  THEMES,
  themeSwatches,
  themeVars,
} from "../lib/themes";
import type { CategoryWeights, CustomThemeColours } from "../types";
import CustomThemeEditor from "./CustomThemeEditor";

const CATEGORIES: { key: keyof CategoryWeights; label: string }[] = [
  { key: "gameplay", label: "Gameplay" },
  { key: "story", label: "Storytelling" },
  { key: "music", label: "Music" },
  { key: "technical", label: "Technical Performance" },
];

const TABS = [
  { id: "general", label: "General" },
  { id: "customisation", label: "Customisation" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const { profile, hasApiKey, loadApiKeyStatus, setProfile, settings, setSettings } = useApp();
  const [tab, setTab] = useState<TabId>("general");

  // General tab state
  const [keyInput, setKeyInput] = useState("");
  const [keyBusy, setKeyBusy] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [extendedSortBusy, setExtendedSortBusy] = useState(false);
  const [extendedSortError, setExtendedSortError] = useState<string | null>(null);
  const [weights, setWeights] = useState<CategoryWeights>(
    profile?.categoryWeights ?? { gameplay: 25, story: 25, music: 25, technical: 25 },
  );
  const [weightsBusy, setWeightsBusy] = useState(false);
  const [weightsMsg, setWeightsMsg] = useState<string | null>(null);

  // Customisation tab state
  const [nameInput, setNameInput] = useState(profile?.username ?? "");
  const [nameBusy, setNameBusy] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [themeBusy, setThemeBusy] = useState(false);
  const [themeError, setThemeError] = useState<string | null>(null);

  const isCustomTheme = settings.theme === CUSTOM_THEME_ID;
  const customVars = themeVars(CUSTOM_THEME_ID, settings.customTheme ?? DEFAULT_CUSTOM_COLOURS);

  // Called by the editor once dragging settles: one store update + one persist.
  // Serialized through themeBusy so a custom save and a preset selection can
  // never persist concurrently (last-to-resolve would otherwise win randomly).
  const handleCustomSettle = useCallback(
    (colours: CustomThemeColours) => {
      if (themeBusy) return; // a preset was chosen after this drag started — it wins
      const previous = useApp.getState().settings;
      setThemeBusy(true);
      setThemeError(null);
      setSettings({ ...previous, theme: CUSTOM_THEME_ID, customTheme: colours });
      api.setCustomTheme(colours.base, colours.accent)
        .then(useApp.getState().setSettings)
        .catch((e) => {
          // Roll back the optimistic store write and CSS vars, like selectTheme.
          setSettings(previous);
          applyTheme(previous.theme, previous.customTheme);
          setThemeError(String(e));
        })
        .finally(() => setThemeBusy(false));
    },
    [setSettings, themeBusy],
  );

  const total = weights.gameplay + weights.story + weights.music + weights.technical;
  const weightsValid = total === 100;

  async function saveName() {
    const next = nameInput.trim();
    if (!next || nameBusy) return;
    setNameBusy(true);
    setNameError(null);
    try {
      const p = await api.renameProfile(next);
      setProfile(p);
      setNameInput(p.username);
    } catch (e) {
      setNameError(String(e));
    } finally {
      setNameBusy(false);
    }
  }

  async function selectTheme(id: string) {
    if (themeBusy) return;
    setThemeBusy(true);
    setThemeError(null);
    applyTheme(id); // instant feedback; store sync follows
    try {
      setSettings(await api.setTheme(id));
    } catch (e) {
      applyTheme(settings.theme, settings.customTheme); // revert on failure
      setThemeError(String(e));
    } finally {
      setThemeBusy(false);
    }
  }

  async function selectCustomTheme() {
    if (themeBusy) return;
    setThemeBusy(true);
    setThemeError(null);
    const colours = settings.customTheme ?? DEFAULT_CUSTOM_COLOURS;
    applyTheme(CUSTOM_THEME_ID, colours);
    try {
      setSettings(await api.setCustomTheme(colours.base, colours.accent));
    } catch (e) {
      applyTheme(settings.theme, settings.customTheme); // revert on failure
      setThemeError(String(e));
    } finally {
      setThemeBusy(false);
    }
  }

  async function saveKey() {
    setKeyBusy(true);
    setKeyError(null);
    try {
      await api.setApiKey(keyInput);
      setKeyInput("");
      await loadApiKeyStatus();
    } catch (e) {
      setKeyError(String(e));
    } finally {
      setKeyBusy(false);
    }
  }

  async function toggleExtendedSorting(enabled: boolean) {
    if (extendedSortBusy) return;
    setExtendedSortBusy(true);
    setExtendedSortError(null);
    const previous = useApp.getState().settings;
    // Optimistic: the Library reads the store, so flip instantly and roll
    // back only if persisting fails.
    setSettings({ ...previous, extendedSorting: enabled });
    try {
      await api.setExtendedSorting(enabled);
    } catch (e) {
      setSettings(previous);
      setExtendedSortError(String(e));
    } finally {
      setExtendedSortBusy(false);
    }
  }

  async function clearKey() {
    setKeyBusy(true);
    setKeyError(null);
    try {
      await api.setApiKey("");
      await loadApiKeyStatus();
    } catch (e) {
      setKeyError(String(e));
    } finally {
      setKeyBusy(false);
    }
  }

  async function saveWeights() {
    setWeightsBusy(true);
    setWeightsMsg(null);
    try {
      await api.updateWeights(weights);
      const p = await api.getProfile();
      setProfile(p);
      setWeightsMsg("Weights saved — all detailed scores were recomputed.");
    } catch (e) {
      setWeightsMsg(String(e));
    } finally {
      setWeightsBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="card max-w-xl w-full p-6 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Settings</h2>
          <button className="btn-ghost !px-3" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="flex gap-1 mb-6">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === t.id
                  ? "bg-accent-600/20 text-accent-400"
                  : "text-slate-400 hover:bg-surface-800 hover:text-slate-200"
              }`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "general" && (
          <div className="space-y-8">
            <section>
              <h3 className="text-sm font-semibold text-slate-200 mb-1">RAWG API key</h3>
              <p className="text-xs text-slate-500 mb-3">
                {hasApiKey
                  ? "A key is configured. Search queries RAWG live and caches results locally."
                  : "No key set. Search falls back to your local cache; grab a free key at rawg.io/apidocs."}
              </p>
              <div className="flex gap-2">
                <input
                  className="input flex-1"
                  placeholder="RAWG API key"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                />
                <button
                  className="btn-primary"
                  disabled={keyBusy || !keyInput.trim()}
                  onClick={saveKey}
                >
                  {keyBusy ? "Validating…" : "Save"}
                </button>
                {hasApiKey && (
                  <button className="btn-ghost" disabled={keyBusy} onClick={clearKey}>
                    Clear
                  </button>
                )}
              </div>
              {keyError && <p className="mt-2 text-xs text-rose-400">{keyError}</p>}
            </section>

            <section>
              <h3 className="text-sm font-semibold text-slate-200 mb-1">
                Extended sorting options
              </h3>
              <p className="text-xs text-slate-500 mb-3">
                Adds the Other sorts (Release date, Playtime, Date rated) and the
                per-category sorts (Gameplay, Story, Music, Technical) to the Library sort
                menu.
              </p>
              <button
                className={`chip py-1.5 ${
                  settings.extendedSorting
                    ? "bg-accent-600/20 text-accent-400 border-accent-500/40"
                    : "bg-surface-800 text-slate-400 border-surface-600"
                }`}
                disabled={extendedSortBusy}
                onClick={() => toggleExtendedSorting(!settings.extendedSorting)}
              >
                {settings.extendedSorting ? "On" : "Off"}
              </button>
              {extendedSortError && (
                <p className="mt-2 text-xs text-rose-400">{extendedSortError}</p>
              )}
            </section>

            <section>
              <h3 className="text-sm font-semibold text-slate-200 mb-1">Detailed score weights</h3>
              <p className="text-xs text-slate-500 mb-4">
                How each category contributes to the overall 100-point score. Current total:{" "}
                <span className={weightsValid ? "text-emerald-400" : "text-amber-400"}>
                  {total.toFixed(0)} / 100
                </span>
                {!weightsValid && " — weights must total exactly 100 before they can be saved."}
              </p>
              <div className="space-y-4">
                {CATEGORIES.map(({ key, label }) => (
                  <div key={key}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-300">{label}</span>
                      <span className="text-slate-500 font-mono">{weights[key].toFixed(0)}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={weights[key]}
                      onChange={(e) =>
                        setWeights({ ...weights, [key]: Number(e.target.value) })
                      }
                      className="w-full accent-accent-500 select-none"
                    />
                  </div>
                ))}
              </div>
              <button
                className="btn-primary mt-4"
                disabled={weightsBusy || !weightsValid}
                onClick={saveWeights}
              >
                {weightsBusy ? "Saving…" : "Save weights"}
              </button>
              {weightsMsg && <p className="mt-2 text-xs text-slate-400">{weightsMsg}</p>}
            </section>
          </div>
        )}

        {tab === "customisation" && (
          <div className="space-y-8">
            <section>
              <h3 className="text-sm font-semibold text-slate-200 mb-1">Username</h3>
              <p className="text-xs text-slate-500 mb-3">
                The local profile name shown in the sidebar and on your dashboard.
              </p>
              <div className="flex gap-2">
                <input
                  className="input flex-1"
                  placeholder="Username"
                  maxLength={32}
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveName()}
                />
                <button
                  className="btn-primary"
                  disabled={nameBusy || !nameInput.trim() || nameInput.trim() === profile?.username}
                  onClick={saveName}
                >
                  {nameBusy ? "Saving…" : "Save"}
                </button>
              </div>
              {nameError && <p className="mt-2 text-xs text-rose-400">{nameError}</p>}
            </section>

            <section>
              <h3 className="text-sm font-semibold text-slate-200 mb-1">Colour theme</h3>
              <p className="text-xs text-slate-500 mb-3">
                Applies instantly and is saved automatically.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {THEMES.map((t) => {
                  const active = t.id === settings.theme;
                  return (
                    <button
                      key={t.id}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-sm transition-colors ${
                        active
                          ? "border-accent-500/60 bg-accent-600/15 text-white"
                          : "border-surface-600 bg-surface-800 text-slate-300 hover:bg-surface-700"
                      }`}
                      disabled={themeBusy}
                      onClick={() => selectTheme(t.id)}
                    >
                      <span className="flex rounded-full overflow-hidden border border-black/40 shrink-0">
                        {themeSwatches(t).map((c, i) => (
                          <span key={i} className="w-3.5 h-3.5" style={{ backgroundColor: c }} />
                        ))}
                      </span>
                      {t.name}
                    </button>
                  );
                })}
                <button
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-sm transition-colors ${
                    isCustomTheme
                      ? "border-accent-500/60 bg-accent-600/15 text-white"
                      : "border-surface-600 bg-surface-800 text-slate-300 hover:bg-surface-700"
                  }`}
                  disabled={themeBusy}
                  onClick={selectCustomTheme}
                >
                  <span className="flex rounded-full overflow-hidden border border-black/40 shrink-0">
                    {["--surface-900", "--accent-400", "--accent-500", "--accent-600"].map((n) => (
                      <span
                        key={n}
                        className="w-3.5 h-3.5"
                        style={{ backgroundColor: `rgb(${customVars[n as keyof typeof customVars]})` }}
                      />
                    ))}
                  </span>
                  Custom
                </button>
              </div>

              {isCustomTheme && (
                <CustomThemeEditor
                  initial={settings.customTheme ?? DEFAULT_CUSTOM_COLOURS}
                  onSettle={handleCustomSettle}
                  disabled={themeBusy}
                />
              )}
              {themeError && <p className="mt-2 text-xs text-rose-400">{themeError}</p>}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
