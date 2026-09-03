import { useState } from "react";
import { api } from "../../api";
import { useAsyncAction } from "../../hooks/useAsyncAction";
import {
  applyTheme,
  CUSTOM_THEME_ID,
  DEFAULT_CUSTOM_COLOURS,
  THEMES,
  themeSwatches,
  themeVars,
} from "../../lib/themes";
import { useApp } from "../../store";
import type { CustomThemeColours, UiSettings } from "../../types";
import CustomThemeEditor from "../CustomThemeEditor";

/**
 * The Customisation tab: username and colour theme. Owns its own field state
 * and mutations; the modal shell only switches tabs.
 */
export default function CustomisationTab() {
  const profile = useApp((s) => s.profile);
  const setProfile = useApp((s) => s.setProfile);
  const settings = useApp((s) => s.settings);
  const setSettings = useApp((s) => s.setSettings);

  const [nameInput, setNameInput] = useState(profile?.username ?? "");
  const name = useAsyncAction();
  const theme = useAsyncAction();

  async function saveName() {
    const next = nameInput.trim();
    if (!next || name.pending) return;
    await name.run(async () => {
      const p = await api.renameProfile(next);
      setProfile(p);
      setNameInput(p.username);
    });
  }

  /**
   * One policy for all three theme flows: apply the change to the UI
   * immediately (CSS vars and/or the store) so the user sees it instantly,
   * adopt the settings the backend returns once the persist lands, and on
   * failure roll the optimistic UI back and surface the error. All three
   * serialize through one busy flag (run's guard), so a custom save and a
   * preset selection can never persist concurrently — the first one in wins
   * and later clicks/settles are dropped while it is in flight.
   */
  function persistTheme(
    apply: () => void,
    persist: () => Promise<UiSettings>,
    rollback: () => void,
  ) {
    void theme.run(async () => {
      apply();
      try {
        setSettings(await persist());
      } catch (e) {
        rollback();
        throw e;
      }
    });
  }

  /** Revert the CSS vars to whatever the store currently holds. */
  function revertCss() {
    const current = useApp.getState().settings;
    applyTheme(current.theme, current.customTheme);
  }

  function selectTheme(id: string) {
    persistTheme(
      () => applyTheme(id), // instant feedback; store sync follows
      () => api.setTheme(id),
      revertCss, // revert on failure
    );
  }

  function selectCustomTheme() {
    const colours = settings.customTheme ?? DEFAULT_CUSTOM_COLOURS;
    persistTheme(
      () => applyTheme(CUSTOM_THEME_ID, colours),
      () => api.setCustomTheme(colours.base, colours.accent),
      revertCss, // revert on failure
    );
  }

  // Called by the editor once dragging settles: one store update + one persist.
  // If a preset was chosen after this drag started, the persist is still in
  // flight and run's guard drops this settle — the preset wins.
  function handleCustomSettle(colours: CustomThemeColours) {
    const previous = useApp.getState().settings;
    persistTheme(
      () => setSettings({ ...previous, theme: CUSTOM_THEME_ID, customTheme: colours }),
      () => api.setCustomTheme(colours.base, colours.accent),
      () => {
        // Roll back the optimistic store write and CSS vars, like selectTheme.
        setSettings(previous);
        applyTheme(previous.theme, previous.customTheme);
      },
    );
  }

  const isCustomTheme = settings.theme === CUSTOM_THEME_ID;
  const customVars = themeVars(CUSTOM_THEME_ID, settings.customTheme ?? DEFAULT_CUSTOM_COLOURS);

  return (
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
            disabled={name.pending || !nameInput.trim() || nameInput.trim() === profile?.username}
            onClick={saveName}
          >
            {name.pending ? "Saving…" : "Save"}
          </button>
        </div>
        {name.error && <p className="mt-2 text-xs text-rose-400">{name.error}</p>}
      </section>

      <section>
        <h3 className="text-sm font-semibold text-slate-200 mb-1">Colour theme</h3>
        <p className="text-xs text-slate-500 mb-3">Applies instantly and is saved automatically.</p>
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
                disabled={theme.pending}
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
            disabled={theme.pending}
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
            disabled={theme.pending}
          />
        )}
        {theme.error && <p className="mt-2 text-xs text-rose-400">{theme.error}</p>}
      </section>
    </div>
  );
}
