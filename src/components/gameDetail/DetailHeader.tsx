import { useState } from "react";
import type { LibraryEntry } from "../../types";
import CoverImage from "../CoverImage";
import { HeartIcon, TrashIcon } from "../icons";
import { formatDate, metaLine, GENRE_PREVIEW_COUNT } from "../../lib/format";

/**
 * Cover band of the detail page: artwork with a fade, the game name, its
 * developer · release date · genres meta line, the favourite toggle and the
 * two-step ("click again to confirm") remove button.
 */
export default function DetailHeader({
  entry,
  onToggleFavourite,
  onRemove,
}: {
  entry: LibraryEntry;
  onToggleFavourite: () => void;
  onRemove: () => void;
}) {
  const [confirmRemove, setConfirmRemove] = useState(false);

  return (
    <div className="relative h-56">
      <CoverImage url={entry.coverUrl} alt={entry.name} className="w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-surface-900 via-surface-900/40 to-transparent" />
      <div className="absolute bottom-4 left-6 right-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">{entry.name}</h1>
          <p className="text-sm text-slate-400 mt-1">
            {metaLine(
              entry.developer,
              entry.releaseDate ? formatDate(entry.releaseDate) : null,
              ...entry.genres.slice(0, GENRE_PREVIEW_COUNT),
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className={`btn ${entry.favourite ? "bg-rose-600 text-white" : "btn-ghost"}`}
            onClick={onToggleFavourite}
            title="Toggle favourite"
          >
            <span className="inline-flex items-center gap-1.5">
              <HeartIcon filled={entry.favourite} />
              {entry.favourite ? "Favourited" : "Favourite"}
            </span>
          </button>
          <button
            className="btn-ghost !text-rose-400"
            onClick={() => (confirmRemove ? onRemove() : setConfirmRemove(true))}
            title="Remove from library"
          >
            <span className="inline-flex items-center gap-1.5">
              <TrashIcon />
              {confirmRemove ? "Click again to confirm" : "Remove"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
