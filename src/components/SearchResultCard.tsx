import type { CachedGame, PlayStatus } from "../types";
import { STATUSES, STATUS_LABELS } from "../types";
import { metaLine, GENRE_PREVIEW_COUNT } from "../lib/format";
import CoverImage from "./CoverImage";

/**
 * One search result: cover, title, meta line and the add-to-library affordance
 * (status dropdown / "In your library" / rate prompt). Deliberately not merged
 * with GameCard — that one renders a full LibraryEntry, this renders a RAWG
 * CachedGame — but the visual structure matches it.
 */
export default function SearchResultCard({
  game,
  inLibrary,
  adding,
  dropdownOpen,
  ratePrompt,
  onToggleDropdown,
  onAdd,
  onRateNow,
  onRateLater,
  onOpenLibrary,
}: {
  game: CachedGame;
  /** Whether this rawgId is already in the library. */
  inLibrary: boolean;
  /** Whether an add is in flight for this card. */
  adding: boolean;
  /** Whether this card's status dropdown is open. */
  dropdownOpen: boolean;
  /** Whether the "Rate it now?" prompt should show (just added from this card). */
  ratePrompt: boolean;
  onToggleDropdown: () => void;
  onAdd: (status: PlayStatus) => void;
  onRateNow: () => void;
  onRateLater: () => void;
  onOpenLibrary: () => void;
}) {
  return (
    <div className="card overflow-hidden relative group">
      <div className="aspect-[16/9] overflow-hidden">
        <CoverImage url={game.coverUrl} alt={game.name} className="w-full h-full object-cover" />
      </div>
      <div className="p-3">
        <h3 className="font-medium text-sm text-slate-100 truncate" title={game.name}>
          {game.name}
        </h3>
        <p className="text-[11px] text-slate-500 mt-0.5 truncate">
          {metaLine(
            game.releaseDate?.split("-")[0],
            game.developer,
            ...game.genres.slice(0, GENRE_PREVIEW_COUNT),
            game.metacritic != null ? `MC ${game.metacritic}` : null,
          )}
        </p>

        {inLibrary ? (
          ratePrompt ? (
            <div className="mt-3 space-y-1.5">
              <p className="text-xs text-slate-400 text-center">Rate it now?</p>
              <div className="flex gap-1.5">
                <button className="btn-primary flex-1 !py-1.5 !text-xs" onClick={onRateNow}>
                  Rate now
                </button>
                <button className="btn-ghost flex-1 !py-1.5 !text-xs" onClick={onRateLater}>
                  Later
                </button>
              </div>
            </div>
          ) : (
            <button className="btn-ghost w-full mt-3 !text-emerald-400" onClick={onOpenLibrary}>
              ✓ In your library — view
            </button>
          )
        ) : (
          <div className="relative mt-3">
            <button className="btn-primary w-full" disabled={adding} onClick={onToggleDropdown}>
              {adding ? "Adding…" : "+ Add to library"}
            </button>
            {dropdownOpen && (
              <div className="absolute bottom-full mb-1 left-0 right-0 card overflow-hidden z-10 shadow-xl">
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-surface-800"
                    onClick={() => onAdd(s)}
                  >
                    {STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
