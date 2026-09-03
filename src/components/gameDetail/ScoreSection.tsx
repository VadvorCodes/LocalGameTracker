import { CATEGORIES, type CategoryWeights } from "../../types";
import { computeWeightedOverall } from "../../lib/scoring";
import CategoryScoreEditor, {
  OverallScorePreview,
  type CategoryScores,
} from "../CategoryScoreEditor";

/**
 * Detailed score section: the shared category sliders plus per-category clear
 * chips, and the weighted overall preview with the save/dirty button. The
 * preview is computed with `computeWeightedOverall(draft, weights)` — the
 * exact same renormalising math the re-rate panel uses.
 */
export default function ScoreSection({
  draft,
  onDraftChange,
  weights,
  dirty,
  onSave,
}: {
  draft: CategoryScores;
  onDraftChange: (next: CategoryScores) => void;
  weights: CategoryWeights;
  /** Draft differs from the saved scores/notes → enable "Save score". */
  dirty: boolean;
  onSave: () => void;
}) {
  const preview = computeWeightedOverall(draft, weights);

  return (
    <section className="bg-surface-800/50 rounded-xl p-4">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
          Detailed score
        </h2>
        <span className="text-[11px] text-slate-500">per-category, 0–100</span>
      </div>
      <div className="space-y-4">
        <CategoryScoreEditor scores={draft} onChange={onDraftChange} weights={weights} />
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map(({ key }) => (
            <button
              key={key}
              className={`chip ${
                draft[key] != null
                  ? "bg-accent-600/20 text-accent-400 border-accent-500/40"
                  : "bg-surface-800 text-slate-500 border-surface-600"
              }`}
              onClick={() => onDraftChange({ ...draft, [key]: null })}
            >
              {draft[key] != null ? `clear ${key}` : `${key}: unset`}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-surface-700 flex items-center justify-between">
        <div>
          <div className="text-[11px] text-slate-500 uppercase tracking-wide">
            Overall (weighted)
          </div>
          <OverallScorePreview value={preview} showScale />
        </div>
        <button className="btn-primary" disabled={!dirty} onClick={onSave}>
          {dirty ? "Save score" : "Saved"}
        </button>
      </div>
    </section>
  );
}
