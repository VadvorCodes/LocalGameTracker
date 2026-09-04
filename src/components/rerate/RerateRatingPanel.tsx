import { useState } from "react";
import { api } from "../../api";
import { useApp } from "../../store";
import type { CategoryWeights, LibraryEntry } from "../../types";
import { DEFAULT_WEIGHTS } from "../../types";
import CoverImage from "../CoverImage";
import { Stars, StarPicker } from "../StarRating";
import CategoryScoreEditor, {
  OverallScorePreview,
  categoryScoresDirty,
  categoryScoresOf,
  type CategoryScores,
} from "../CategoryScoreEditor";
import { divergenceText, formatDate } from "../../lib/format";
import { computeWeightedOverall } from "../../lib/scoring";

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
  onSaved: () => void;
  onSkipped: () => void;
}) {
  const profile = useApp((s) => s.profile);
  const weights: CategoryWeights = profile?.categoryWeights ?? DEFAULT_WEIGHTS;

  const [starDraft, setStarDraft] = useState<number | null>(entry.starRating);
  const [catDraft, setCatDraft] = useState<CategoryScores>(() => categoryScoresOf(entry));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = computeWeightedOverall(catDraft, weights);

  async function saveAndContinue() {
    setBusy(true);
    setError(null);
    try {
      if (starDraft !== entry.starRating) {
        await api.setStarRating(entry.id, starDraft);
      }
      if (categoryScoresDirty(catDraft, entry)) {
        await api.setCategoryScores(entry.id, catDraft);
      }
      await api.markRerated(entry.id);
      onSaved();
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
          <CoverImage
            url={entry.coverUrl}
            alt={entry.name}
            className="w-full h-full object-cover"
          />
        </div>
        <div className="min-w-0 flex-1 basis-48">
          <h2 className="text-lg font-semibold text-white leading-tight truncate">{entry.name}</h2>
          <p className="text-xs text-slate-500 mt-0.5 truncate">
            {entry.ratedAt ? `Rated ${formatDate(entry.ratedAt)}` : "Not rated yet"} — how does it
            hold up?
          </p>
        </div>
      </div>

      <section className="bg-surface-800/50 rounded-xl p-4">
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
            Quick rating
          </h3>
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
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
            Detailed score
          </h3>
          <span className="text-[11px] text-slate-500">per-category, 0–100</span>
        </div>
        <div className="space-y-4">
          <CategoryScoreEditor
            scores={catDraft}
            onChange={setCatDraft}
            weights={weights}
            previous={categoryScoresOf(entry)}
          />
        </div>
        <div className="mt-4 pt-4 border-t border-surface-700 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div>
            <div className="text-[11px] text-slate-500 uppercase tracking-wide">
              Overall (weighted)
            </div>
            <OverallScorePreview value={preview} was={entry.computedOverall} />
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
