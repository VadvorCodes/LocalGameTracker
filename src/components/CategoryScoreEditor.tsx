import { CATEGORIES, type CategoryScores, type CategoryWeights, type LibraryEntry } from "../types";
import { scoreColor } from "../lib/format";

export type { CategoryScores };

/** All-null draft (page loads fill it in from the entry). */
export function emptyCategoryScores(): CategoryScores {
  return Object.fromEntries(CATEGORIES.map(({ key }) => [key, null])) as CategoryScores;
}

/** The saved scores of an entry as a draft-shaped record. */
export function categoryScoresOf(entry: Pick<LibraryEntry, keyof CategoryScores>): CategoryScores {
  return Object.fromEntries(CATEGORIES.map(({ key }) => [key, entry[key]])) as CategoryScores;
}

/** Whether any category differs between a draft and the saved scores. */
export function categoryScoresDirty(a: CategoryScores, b: CategoryScores): boolean {
  return CATEGORIES.some(({ key }) => a[key] !== b[key]);
}

/**
 * The four detailed-score sliders with their weight labels — shared by the
 * game detail page and the re-rate panel so the field markup stays in
 * lockstep. Renders a fragment of rows: put it inside a `space-y-*` container
 * (alongside any extra controls, e.g. clear chips) for spacing.
 */
export default function CategoryScoreEditor({
  scores,
  onChange,
  weights,
  previous,
}: {
  scores: CategoryScores;
  /** Replace the whole draft with one category's slider moved. */
  onChange: (next: CategoryScores) => void;
  /** Profile weights, shown as a percentage after each label. */
  weights: CategoryWeights;
  /** Saved scores rendered as " · was N" after each weight (re-rate panel). */
  previous?: CategoryScores;
}) {
  return (
    <>
      {CATEGORIES.map(({ key, label }) => {
        const value = scores[key];
        return (
          <div key={key}>
            <div className="flex justify-between gap-3 text-xs mb-1">
              <span className="text-slate-300 min-w-0 truncate">
                {label}
                <span className="text-slate-500">
                  {" "}
                  ({weights[key].toFixed(0)}%)
                  {previous && previous[key] != null && <> · was {previous[key]}</>}
                </span>
              </span>
              <span className="font-mono text-slate-400 shrink-0">{value ?? "—"}</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={value ?? 50}
              onChange={(e) => onChange({ ...scores, [key]: Number(e.target.value) })}
              className={`w-full select-none ${
                value != null ? "accent-accent-500" : "accent-surface-600"
              }`}
            />
          </div>
        );
      })}
    </>
  );
}

/**
 * The weighted-overall number that sits under the sliders: one decimal,
 * colour-coded by band, "—" when no category is scored. Both callers feed it
 * from `computeWeightedOverall(draft, weights)` so the renormalisation math is
 * defined in exactly one place (lib/scoring.ts).
 */
export function OverallScorePreview({
  value,
  showScale,
  was,
}: {
  value: number | null;
  /** Append the " / 100" scale suffix (game detail page). */
  showScale?: boolean;
  /** Previously computed overall, shown as "was N" (re-rate panel). */
  was?: number | null;
}) {
  const color = value != null ? scoreColor(value) : "text-slate-600";
  if (showScale) {
    return (
      <div className={`text-3xl font-bold ${color}`}>
        {value != null ? value.toFixed(1) : "—"}
        <span className="text-sm text-slate-500 font-normal"> / 100</span>
      </div>
    );
  }
  return (
    <div className="flex items-baseline gap-2">
      <span className={`text-3xl font-bold ${color}`}>
        {value != null ? value.toFixed(1) : "—"}
      </span>
      {was != null && <span className="text-xs text-slate-500">was {was.toFixed(1)}</span>}
    </div>
  );
}
