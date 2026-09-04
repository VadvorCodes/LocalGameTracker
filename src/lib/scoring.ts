import type { CategoryScores, CategoryWeights } from "../types";

/**
 * Preview of the weighted overall score for a (possibly partial) draft,
 * mirroring the backend's scoring.rs::compute_overall: only filled categories
 * contribute and their weights renormalize, both the weighted and the
 * degenerate all-zero-weights fallback round to one decimal, and a draft with
 * no filled category scores to null.
 */
export function computeWeightedOverall(
  scores: CategoryScores,
  weights: CategoryWeights,
): number | null {
  const pairs: [number | null, number][] = [
    [scores.gameplay, weights.gameplay],
    [scores.story, weights.story],
    [scores.music, weights.music],
    [scores.technical, weights.technical],
  ];
  const filled = pairs.filter(([v]) => v != null) as [number, number][];
  if (filled.length === 0) return null;
  const round1 = (v: number) => Math.round(v * 10) / 10;
  const totalW = filled.reduce((s, [, wt]) => s + wt, 0);
  if (totalW <= 0) {
    return round1(filled.reduce((s, [v]) => s + v, 0) / filled.length);
  }
  return round1(filled.reduce((s, [v, wt]) => s + v * wt, 0) / totalW);
}
