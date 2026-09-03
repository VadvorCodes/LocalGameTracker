import type { LibraryEntry } from "../../types";
import { STATUS_COLORS, STATUS_LABELS } from "../../types";
import CoverImage from "../CoverImage";
import { Stars } from "../StarRating";
import { scoreColor } from "../../lib/format";

/** Compact "closest genre match" card shown beside the card being re-rated. */
export default function MatchCard({ entry }: { entry: LibraryEntry }) {
  return (
    <div className="card overflow-hidden w-44 shrink-0">
      <div className="relative aspect-[16/9] overflow-hidden">
        <CoverImage url={entry.coverUrl} alt={entry.name} className="w-full h-full object-cover" />
        <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-surface-900 to-transparent" />
      </div>
      <div className="p-2.5 space-y-1.5">
        <h4 className="text-xs font-medium text-slate-100 truncate" title={entry.name}>
          {entry.name}
        </h4>
        <div className="flex items-center justify-between gap-2">
          <Stars value={entry.starRating} />
          {entry.computedOverall != null && (
            <span className={`text-xs font-semibold ${scoreColor(entry.computedOverall)}`}>
              {entry.computedOverall.toFixed(1)}
            </span>
          )}
        </div>
        <span className={`chip ${STATUS_COLORS[entry.status]} !text-[10px]`}>
          {STATUS_LABELS[entry.status]}
        </span>
      </div>
    </div>
  );
}
