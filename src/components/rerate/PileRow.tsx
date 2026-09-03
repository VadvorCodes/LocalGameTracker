import type { LibraryEntry } from "../../types";
import CoverImage from "../CoverImage";
import { Stars } from "../StarRating";
import { scoreColor } from "../../lib/format";

/** One game row in a review pile: click toggles the pile, drag reorders.
 * `dropBefore` + `dropEdge` draw the insertion line on the marked side. */
export default function PileRow({
  entry,
  dragging,
  dropBefore,
  dropEdge,
  onToggle,
  onDragStart,
  onDragEnd,
}: {
  entry: LibraryEntry;
  dragging: boolean;
  dropBefore: boolean;
  dropEdge: "top" | "left" | null;
  onToggle: (id: number) => void;
  onDragStart: (id: number) => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      className={`border-2 border-transparent ${
        dropBefore ? (dropEdge === "left" ? "border-l-accent-500" : "border-t-accent-500") : ""
      }`}
    >
      <button
        data-pile-row
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", String(entry.id));
          onDragStart(entry.id);
        }}
        onDragEnd={onDragEnd}
        className={`card w-full p-2 flex items-center gap-3 text-left hover:border-accent-500/50 transition-colors ${
          dragging ? "opacity-40" : ""
        }`}
        onClick={() => onToggle(entry.id)}
        title="Click to move to the other pile, drag to reorder"
      >
        <div className="w-20 h-12 rounded overflow-hidden shrink-0 bg-surface-800">
          <CoverImage
            url={entry.coverUrl}
            alt={entry.name}
            className="w-full h-full object-cover"
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm text-slate-100 truncate">{entry.name}</div>
          <div className="flex items-center gap-2 mt-1">
            <Stars value={entry.starRating} />
            {entry.computedOverall != null && (
              <span className={`text-xs font-semibold ${scoreColor(entry.computedOverall)}`}>
                {entry.computedOverall.toFixed(1)}
              </span>
            )}
          </div>
        </div>
      </button>
    </div>
  );
}
