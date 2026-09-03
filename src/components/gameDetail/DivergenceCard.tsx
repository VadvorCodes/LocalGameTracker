import type { LibraryEntry } from "../../types";
import { Stars } from "../StarRating";
import { divergenceText, scoreColor } from "../../lib/format";

/**
 * The "stars vs detailed score" card; renders nothing unless both a star
 * rating and a computed overall exist.
 */
export default function DivergenceCard({ entry }: { entry: LibraryEntry }) {
  if (entry.starRating == null || entry.computedOverall == null) return null;

  return (
    <section className="text-xs text-slate-400 bg-surface-800/50 rounded-xl p-4">
      <div className="flex items-center gap-4">
        <Stars value={entry.starRating} />
        <span className="text-slate-600">vs</span>
        <span className={`font-semibold ${scoreColor(entry.computedOverall)}`}>
          {entry.computedOverall.toFixed(1)}/100
        </span>
      </div>
      <p className="mt-2 text-slate-500">
        {divergenceText(entry.starRating, entry.computedOverall)}
      </p>
    </section>
  );
}
