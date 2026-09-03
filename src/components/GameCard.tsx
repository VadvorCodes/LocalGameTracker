import type { LibraryEntry } from "../types";
import { STATUS_COLORS, STATUS_LABELS } from "../types";
import CoverImage from "./CoverImage";
import { Stars } from "./StarRating";
import { HeartIcon } from "./icons";
import { formatPlaytime } from "../lib/format";

export function GameCard({ entry, onOpen }: { entry: LibraryEntry; onOpen: (id: number) => void }) {
  return (
    <div
      className="card overflow-hidden cursor-pointer group hover:border-accent-500/50 transition-colors"
      onClick={() => onOpen(entry.id)}
    >
      <div className="relative aspect-[16/9] overflow-hidden">
        <CoverImage
          url={entry.coverUrl}
          alt={entry.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-surface-900 to-transparent" />
        {entry.favourite && (
          <div className="absolute top-2 right-2 text-rose-400 bg-surface-950/70 rounded-full p-1.5">
            <HeartIcon filled />
          </div>
        )}
      </div>
      <div className="p-3">
        <h3 className="font-medium text-sm text-slate-100 line-clamp-2" title={entry.name}>
          {entry.name}
        </h3>
        <div className="mt-2 space-y-1.5">
          <div>
            <span className={`chip ${STATUS_COLORS[entry.status]}`}>
              {STATUS_LABELS[entry.status]}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Stars value={entry.starRating} />
            {entry.computedOverall != null && (
              <span
                className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                  entry.computedOverall >= 75
                    ? "text-emerald-300"
                    : entry.computedOverall >= 50
                      ? "text-amber-300"
                      : "text-rose-300"
                }`}
              >
                {entry.computedOverall.toFixed(1)}
              </span>
            )}
          </div>
        </div>
        {(entry.playtimeMinutes > 0 || entry.genres.length > 0) && (
          <div className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-500 truncate">
            {entry.playtimeMinutes > 0 && <span>{formatPlaytime(entry.playtimeMinutes)}</span>}
            <span className="truncate">{entry.genres.slice(0, 3).join(" · ")}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="card overflow-hidden animate-pulse">
      <div className="aspect-[16/9] bg-surface-800" />
      <div className="p-3 space-y-2">
        <div className="h-4 bg-surface-800 rounded w-3/4" />
        <div className="h-3 bg-surface-800 rounded w-1/2" />
      </div>
    </div>
  );
}
