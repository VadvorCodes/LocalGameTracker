import { useState } from "react";
import { api } from "../../api";
import { useApp } from "../../store";
import type { CategoryWeights, LibraryEntry } from "../../types";
import CoverImage from "../CoverImage";
import { Stars, StarPicker } from "../StarRating";
import { divergenceText, scoreColor } from "../../lib/format";
import { computeWeightedOverall } from "../../lib/scoring";

const CATEGORIES = [
  { key: "gameplay", label: "Gameplay" },
  { key: "story", label: "Storytelling" },
  { key: "music", label: "Music" },
  { key: "technical", label: "Technical Performance" },
] as const;

type CatKey = (typeof CATEGORIES)[number]["key"];

/**
 * The per-game re-rating editor: star picker + detailed category sliders with
 * the previous values shown for reference. "Save & continue" persists the new
 * rating and applies the hidden re-rated tag; "Skip" leaves the game untouched
 * (and untagged, so it can come back in a later cycle).
 */
export default function RerateRatingPanel({
  entry,
  onSaved,
  onSkipped,
}: {
  entry: LibraryEntry;
  onSaved: (updated: LibraryEntry) => void;
  onSkipped: () => void;
}) {
  const profile = useApp((s) => s.profile);
  const weights: CategoryWeights = profile?.categoryWeights ?? {
    gameplay: 25, story: 25, music: 25, technical: 25,
  };

  const [starDraft, setStarDraft] = useState<number | null>(entry.starRating);
  const [catDraft, setCatDraft] = useState<Record<CatKey, number | null>>({
    gameplay: entry.gameplay, story: entry.story,
    music: entry.music, technical: entry.technical,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = computeWeightedOverall(catDraft, weights);

  async function saveAndContinue() {
    setBusy(true);
    setError(null);
    try {
      let updated = entry;
      if (starDraft !== entry.starRating) {
        updated = await api.setStarRating(entry.id, starDraft);
      }
      if (
        catDraft.gameplay !== entry.gameplay ||
        catDraft.story !== entry.story ||
        catDraft.music !== entry.music ||
        catDraft.technical !== entry.technical
      ) {
        updated = await api.setCategoryScores(entry.id, catDraft);
      }
      await api.markRerated(entry.id);
      onSaved(updated);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card max-w-2xl w-full p-4 sm:p-6 space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <div className="w-24 h-14 rounded-lg overflow-hidden shrink-0 bg-surface-800">
          <CoverImage url={entry.coverUrl} alt={entry.name} className="w-full h-full object-cover" />
        </div>
        <div className="min-w-0 flex-1 basis-48">
          <h2 className="text-lg font-semibold text-white leading-tight truncate">{entry.name}</h2>
          <p className="text-xs text-slate-500 mt-0.5 truncate">
            Rated {entry.ratedAt ? "a while ago" : "before"} — how does it hold up?
          </p>
        </div>
      </div>

      <section className="bg-surface-800/50 rounded-xl p-4">
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Quick rating</h3>
          <span className="text-[11px] text-slate-500">
            was{" "}
            {entry.starRating != null ? (
              <span className="inline-flex items-center gap-1 align-middle">
                <Stars value={entry.starRating} />
                <span>{entry.starRating}/5</span>
              </span>
            ) : (
              "unrated"
            )}
          </span>
        </div>
        <StarPicker value={starDraft} onChange={setStarDraft} />
      </section>

      <section className="bg-surface-800/50 rounded-xl p-4">
        <div className="flex items-baseline justify-between mb-4">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Detailed score</h3>
          <span className="text-[11px] text-slate-500">per-category, 0–100</span>
        </div>
        <div className="space-y-4">
          {CATEGORIES.map(({ key, label }) => (
            <div key={key}>
              <div className="flex justify-between gap-3 text-xs mb-1">
                <span className="text-slate-300 min-w-0 truncate">
                  {label}
                  <span className="text-slate-500">
                    {" "}({weights[key].toFixed(0)}%){entry[key] != null && <> · was {entry[key]}</>}
                  </span>
                </span>
                <span className="font-mono text-slate-400 shrink-0">{catDraft[key] ?? "—"}</span>
              </div>
              <input
                type="range" min={0} max={100} step={1}
                value={catDraft[key] ?? 50}
                onChange={(e) => setCatDraft({ ...catDraft, [key]: Number(e.target.value) })}
                className={`w-full select-none ${
                  catDraft[key] != null ? "accent-accent-500" : "accent-surface-600"
                }`}
              />
            </div>
          ))}
        </div>
        <div className="mt-4 pt-4 border-t border-surface-700 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div>
            <div className="text-[11px] text-slate-500 uppercase tracking-wide">Overall (weighted)</div>
            <div className="flex items-baseline gap-2">
              <span className={`text-3xl font-bold ${preview != null ? scoreColor(preview) : "text-slate-600"}`}>
                {preview != null ? preview.toFixed(1) : "—"}
              </span>
              {entry.computedOverall != null && (
                <span className="text-xs text-slate-500">was {entry.computedOverall.toFixed(1)}</span>
              )}
            </div>
          </div>
          {starDraft != null && preview != null && (
            <p className="text-xs text-slate-500 max-w-[260px] text-right">
              {divergenceText(starDraft, preview)}
            </p>
          )}
        </div>
      </section>

      {error && <p className="text-xs text-rose-400">{error}</p>}

      <div className="flex items-center justify-between">
        <button className="btn-ghost" disabled={busy} onClick={onSkipped}>
          Skip — leave as is
        </button>
        <button className="btn-primary" disabled={busy} onClick={saveAndContinue}>
          {busy ? "Saving…" : "Save & continue"}
        </button>
      </div>
    </div>
  );
}
