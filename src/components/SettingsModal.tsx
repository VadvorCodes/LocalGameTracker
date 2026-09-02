import { useState } from "react";
import { api } from "../api";
import { useApp } from "../store";
import type { CategoryWeights } from "../types";

const CATEGORIES: { key: keyof CategoryWeights; label: string }[] = [
  { key: "gameplay", label: "Gameplay" },
  { key: "story", label: "Storytelling" },
  { key: "music", label: "Music" },
  { key: "technical", label: "Technical Performance" },
];

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const { profile, hasApiKey, loadApiKeyStatus, setProfile } = useApp();
  const [keyInput, setKeyInput] = useState("");
  const [keyBusy, setKeyBusy] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [weights, setWeights] = useState<CategoryWeights>(
    profile?.categoryWeights ?? { gameplay: 25, story: 25, music: 25, technical: 25 },
  );
  const [weightsBusy, setWeightsBusy] = useState(false);
  const [weightsMsg, setWeightsMsg] = useState<string | null>(null);

  const total = weights.gameplay + weights.story + weights.music + weights.technical;

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
        className="card max-w-lg w-full p-6 space-y-8 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Settings</h2>
          <button className="btn-ghost !px-3" onClick={onClose}>
            Close
          </button>
        </div>

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
            <button className="btn-primary" disabled={keyBusy || !keyInput.trim()} onClick={saveKey}>
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
          <h3 className="text-sm font-semibold text-slate-200 mb-1">Detailed score weights</h3>
          <p className="text-xs text-slate-500 mb-4">
            How each category contributes to the overall 100-point score. Current total:{" "}
            <span className={total === 100 ? "text-emerald-400" : "text-amber-400"}>
              {total.toFixed(0)} / 100
            </span>{" "}
            (weights are normalized, so any positive values work).
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
          <button className="btn-primary mt-4" disabled={weightsBusy} onClick={saveWeights}>
            {weightsBusy ? "Saving…" : "Save weights"}
          </button>
          {weightsMsg && <p className="mt-2 text-xs text-slate-400">{weightsMsg}</p>}
        </section>
      </div>
    </div>
  );
}
