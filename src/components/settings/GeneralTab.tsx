import { useState } from "react";
import { api } from "../../api";
import { useAsyncAction } from "../../hooks/useAsyncAction";
import { useApp } from "../../store";
import { CATEGORIES, DEFAULT_WEIGHTS } from "../../types";
import type { CategoryWeights } from "../../types";

/**
 * The General tab: RAWG API key, extended sorting and the detailed score
 * weights. Owns its own field state and mutations; the modal shell only
 * switches tabs.
 */
export default function GeneralTab() {
  const hasApiKey = useApp((s) => s.hasApiKey);
  const loadApiKeyStatus = useApp((s) => s.loadApiKeyStatus);
  const setProfile = useApp((s) => s.setProfile);
  const extendedSorting = useApp((s) => s.settings.extendedSorting);
  const setSettings = useApp((s) => s.setSettings);
  const savedWeights = useApp((s) => s.profile?.categoryWeights);

  const [keyInput, setKeyInput] = useState("");
  const key = useAsyncAction();
  const extendedSort = useAsyncAction();
  const [weights, setWeights] = useState<CategoryWeights>(savedWeights ?? DEFAULT_WEIGHTS);
  const weightsAction = useAsyncAction();
  const [weightsMsg, setWeightsMsg] = useState<string | null>(null);

  async function saveKey() {
    await key.run(async () => {
      await api.setApiKey(keyInput);
      setKeyInput("");
      await loadApiKeyStatus();
    });
  }

  async function clearKey() {
    await key.run(async () => {
      await api.setApiKey("");
      await loadApiKeyStatus();
    });
  }

  function toggleExtendedSorting(enabled: boolean) {
    const previous = useApp.getState().settings;
    void extendedSort.run(async () => {
      // Optimistic: the Library reads the store, so flip instantly and roll
      // back only if persisting fails.
      setSettings({ ...previous, extendedSorting: enabled });
      try {
        await api.setExtendedSorting(enabled);
      } catch (e) {
        setSettings(previous);
        throw e;
      }
    });
  }

  async function saveWeights() {
    setWeightsMsg(null);
    await weightsAction.run(async () => {
      await api.updateWeights(weights);
      setProfile(await api.getProfile());
      setWeightsMsg("Weights saved — all detailed scores were recomputed.");
    });
  }

  const total = weights.gameplay + weights.story + weights.music + weights.technical;
  const weightsValid = total === 100;

  return (
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
            disabled={key.pending || !keyInput.trim()}
            onClick={saveKey}
          >
            {key.pending ? "Validating…" : "Save"}
          </button>
          {hasApiKey && (
            <button className="btn-ghost" disabled={key.pending} onClick={clearKey}>
              Clear
            </button>
          )}
        </div>
        {key.error && <p className="mt-2 text-xs text-rose-400">{key.error}</p>}
      </section>

      <section>
        <h3 className="text-sm font-semibold text-slate-200 mb-1">Extended sorting options</h3>
        <p className="text-xs text-slate-500 mb-3">
          Adds the Other sorts (Release date, Playtime, Date rated) and the per-category sorts
          (Gameplay, Story, Music, Technical) to the Library sort menu.
        </p>
        <button
          aria-pressed={extendedSorting}
          className={`chip py-1.5 ${extendedSorting ? "chip-active" : "chip-idle"}`}
          disabled={extendedSort.pending}
          onClick={() => toggleExtendedSorting(!extendedSorting)}
        >
          {extendedSorting ? "On" : "Off"}
        </button>
        {extendedSort.error && <p className="mt-2 text-xs text-rose-400">{extendedSort.error}</p>}
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
                onChange={(e) => setWeights({ ...weights, [key]: Number(e.target.value) })}
                className="w-full accent-accent-500 select-none"
              />
            </div>
          ))}
        </div>
        <button
          className="btn-primary mt-4"
          disabled={weightsAction.pending || !weightsValid}
          onClick={saveWeights}
        >
          {weightsAction.pending ? "Saving…" : "Save weights"}
        </button>
        {weightsAction.error && <p className="mt-2 text-xs text-rose-400">{weightsAction.error}</p>}
        {weightsMsg && <p className="mt-2 text-xs text-slate-400">{weightsMsg}</p>}
      </section>
    </div>
  );
}
