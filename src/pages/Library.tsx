import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import type { LibraryEntry, LibraryQuery, PlayStatus, SortKey } from "../types";
import { SORT_LABELS, STATUSES, STATUS_COLORS, STATUS_LABELS } from "../types";
import { GameCard, SkeletonCard } from "../components/GameCard";
import FilterGroup from "../components/FilterGroup";
import { formatPlaytime } from "../lib/format";
import { toggleSet } from "../lib/sets";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { useSequentialFetch } from "../hooks/useSequentialFetch";
import { useApp } from "../store";

// Rating, detailed rating, date added and name sit at the top of the sort
// menu; the "Other" and "By category" groups appear only when "Extended
// sorting options" is enabled in Settings.
const PRIMARY_SORTS: SortKey[] = ["stars", "score", "added", "name"];
const OTHER_SORTS: SortKey[] = ["releaseDate", "playtime", "ratedAt"];
const CATEGORY_SORTS: SortKey[] = ["gameplay", "story", "music", "technical"];
// Every sort that only exists while extended sorting is enabled.
const EXTENDED_SORTS: SortKey[] = [...OTHER_SORTS, ...CATEGORY_SORTS];

/** The chip/range filters, as one object so initial state and "Clear all" cannot drift. */
interface Filters {
  statuses: Set<PlayStatus>;
  favouritesOnly: boolean;
  selGenres: Set<string>;
  selPlatforms: Set<string>;
  minStars: number;
  minScore: number;
}

/** Factory (not a shared const) so every session gets its own Set instances;
 * all updates below are immutable, so the returned object is never mutated. */
function makeDefaultFilters(): Filters {
  return {
    statuses: new Set<PlayStatus>(),
    favouritesOnly: false,
    selGenres: new Set<string>(),
    selPlatforms: new Set<string>(),
    minStars: 0,
    minScore: 0,
  };
}

export default function Library() {
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Filters>(makeDefaultFilters);
  const [genres, setGenres] = useState<string[]>([]);
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [sort, setSort] = useState<SortKey>("stars");
  const [sortDesc, setSortDesc] = useState(true);
  const [filterPanel, setFilterPanel] = useState(false);
  const navigate = useNavigate();
  const profile = useApp((s) => s.profile);
  const extendedSorting = useApp((s) => s.settings.extendedSorting);
  // Destructure: begin/isCurrent are stable callbacks (the wrapper object is not),
  // so they are safe to key useCallback/useEffect dependencies on.
  const { begin: beginQuery, isCurrent: isCurrentQuery } = useSequentialFetch();
  const { begin: beginFacets, isCurrent: isCurrentFacets } = useSequentialFetch();
  // Render and query through effectiveSort: if extended sorting is switched
  // off while an extended sort is active, fall back to Rating (keeping the
  // chosen direction) without ever rendering a mismatched select.
  const effectiveSort = extendedSorting || !EXTENDED_SORTS.includes(sort) ? sort : "stars";

  // The exact payload sent over IPC. Memoized (with the profile folded in, so
  // a profile switch restarts the debounce like any other input) — its identity
  // changes only when a query input actually changed.
  const queryInput = useMemo(
    () => ({
      profileId: profile?.id,
      q: {
        search: search.trim() || undefined,
        statuses: [...filters.statuses],
        favouritesOnly: filters.favouritesOnly || undefined,
        genres: [...filters.selGenres],
        platforms: [...filters.selPlatforms],
        minStars: filters.minStars > 0 ? filters.minStars : undefined,
        minScore: filters.minScore > 0 ? filters.minScore : undefined,
        sort: effectiveSort,
        sortDesc,
      } satisfies LibraryQuery,
    }),
    [profile, search, filters, effectiveSort, sortDesc],
  );
  // useDebouncedValue passes its first value straight through, so the chain
  // starts at null and mirrors `queryInput` — that way the initial mount load
  // waits out the same 200ms window as later edits, and every input change
  // restarts the one pending timer (a burst of edits fires a single query).
  const [queuedInput, setQueuedInput] = useState<typeof queryInput | null>(null);
  useEffect(() => {
    setQueuedInput(queryInput);
  }, [queryInput]);
  const debouncedInput = useDebouncedValue(queuedInput, 200);

  const load = useCallback(async () => {
    if (!debouncedInput) return;
    const seq = beginQuery();
    setLoading(true);
    try {
      const result = await api.libraryQuery(debouncedInput.q);
      if (!isCurrentQuery(seq)) return; // a newer query superseded this one
      setEntries(result);
      setError(null);
    } catch (e) {
      if (!isCurrentQuery(seq)) return;
      setError(String(e));
    } finally {
      if (isCurrentQuery(seq)) setLoading(false);
    }
  }, [beginQuery, isCurrentQuery, debouncedInput]);

  useEffect(() => {
    void load();
  }, [load]);

  // Keep the raw sort state honest once extended sorting is off.
  useEffect(() => {
    if (!extendedSorting && EXTENDED_SORTS.includes(sort)) setSort("stars");
  }, [extendedSorting, sort]);

  // Genre/platform facet options describe the whole library, not the current
  // filtered view, so they are loaded once per profile — refetching them
  // whenever the row count changed (the old trigger) just re-queried identical
  // data every time the page's own filters changed the count. Games added or
  // removed on other pages remount this route, which reloads them.
  useEffect(() => {
    const seq = beginFacets();
    api
      .getGenresAndPlatforms()
      .then((info) => {
        if (isCurrentFacets(seq)) {
          setGenres(info.genres);
          setPlatforms(info.platforms);
        }
      })
      .catch(() => {}); // the filter panel just falls back to no options
  }, [beginFacets, isCurrentFacets, profile]);

  const activeFilters =
    filters.statuses.size +
    (filters.favouritesOnly ? 1 : 0) +
    filters.selGenres.size +
    filters.selPlatforms.size +
    (filters.minStars > 0 ? 1 : 0) +
    (filters.minScore > 0 ? 1 : 0);

  const totalPlaytime = useMemo(
    () => entries.reduce((sum, e) => sum + e.playtimeMinutes, 0),
    [entries],
  );

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white">Library</h1>
          <p className="text-sm text-slate-500 mt-1">
            {loading ? "…" : `${entries.length} game${entries.length === 1 ? "" : "s"}`}
            {totalPlaytime > 0 && ` · ${formatPlaytime(totalPlaytime)} tracked`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            className="input w-56"
            placeholder="Filter by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            className={`btn ${filterPanel || activeFilters ? "bg-accent-600 text-white" : "btn-ghost"}`}
            onClick={() => setFilterPanel(!filterPanel)}
          >
            Filters{activeFilters ? ` (${activeFilters})` : ""}
          </button>
          <span className="text-sm text-slate-400">Sort</span>
          <select
            className="input"
            value={effectiveSort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            {PRIMARY_SORTS.map((s) => (
              <option key={s} value={s}>
                {SORT_LABELS[s]}
              </option>
            ))}
            {extendedSorting && (
              <>
                <optgroup label="Other">
                  {OTHER_SORTS.map((s) => (
                    <option key={s} value={s}>
                      {SORT_LABELS[s]}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="By category">
                  {CATEGORY_SORTS.map((s) => (
                    <option key={s} value={s}>
                      {SORT_LABELS[s]}
                    </option>
                  ))}
                </optgroup>
              </>
            )}
          </select>
          <button
            className="btn-ghost !px-3"
            title={sortDesc ? "Descending" : "Ascending"}
            onClick={() => setSortDesc(!sortDesc)}
          >
            {sortDesc ? "↓" : "↑"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 chip bg-rose-500/10 text-rose-300 border-rose-500/30 py-1.5">
          {error}
        </div>
      )}

      {filterPanel && (
        <div className="card p-4 mb-6 space-y-4">
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((s) => {
              const c = STATUS_COLORS[s];
              return (
                <button
                  key={s}
                  className={`chip py-1.5 ${
                    filters.statuses.has(s)
                      ? `${c.bg} ${c.text} ${c.border}`
                      : "bg-surface-800 text-slate-400 border-surface-600"
                  }`}
                  onClick={() => setFilters((f) => ({ ...f, statuses: toggleSet(f.statuses, s) }))}
                >
                  {STATUS_LABELS[s]}
                </button>
              );
            })}
            <button
              className={`chip py-1.5 ${filters.favouritesOnly ? "bg-rose-500/15 text-rose-300 border-rose-500/30" : "bg-surface-800 text-slate-400 border-surface-600"}`}
              onClick={() => setFilters((f) => ({ ...f, favouritesOnly: !f.favouritesOnly }))}
            >
              ♥ Favourites
            </button>
          </div>

          {(genres.length > 0 || platforms.length > 0) && (
            <div className="grid md:grid-cols-2 gap-4">
              <FilterGroup
                title="Genres"
                options={genres}
                selected={filters.selGenres}
                onToggle={(g) =>
                  setFilters((f) => ({ ...f, selGenres: toggleSet(f.selGenres, g) }))
                }
              />
              <FilterGroup
                title="Platforms"
                options={platforms}
                selected={filters.selPlatforms}
                onToggle={(p) =>
                  setFilters((f) => ({ ...f, selPlatforms: toggleSet(f.selPlatforms, p) }))
                }
              />
            </div>
          )}

          <div className="flex flex-wrap gap-8">
            <label className="text-xs text-slate-400">
              <div className="mb-1">
                Min rating: <span className="text-slate-200">{filters.minStars}</span>
              </div>
              <input
                type="range"
                min={0}
                max={5}
                step={0.5}
                value={filters.minStars}
                onChange={(e) => setFilters((f) => ({ ...f, minStars: Number(e.target.value) }))}
                className="w-48 accent-accent-500 select-none"
              />
            </label>
            <label className="text-xs text-slate-400">
              <div className="mb-1">
                Min detailed rating: <span className="text-slate-200">{filters.minScore}</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={filters.minScore}
                onChange={(e) => setFilters((f) => ({ ...f, minScore: Number(e.target.value) }))}
                className="w-48 accent-accent-500 select-none"
              />
            </label>
            {activeFilters > 0 && (
              <button
                className="btn-ghost self-end text-xs"
                onClick={() => setFilters(makeDefaultFilters())}
              >
                Clear all
              </button>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center mt-24">
          <div className="text-4xl mb-3">🕹️</div>
          <p className="text-slate-400">
            {activeFilters || search
              ? "No games match these filters."
              : "Your library is empty — search for a game to add it."}
          </p>
          <button className="btn-primary mt-4" onClick={() => navigate("/search")}>
            Go to search
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {entries.map((e) => (
            <GameCard key={e.id} entry={e} onOpen={(id) => navigate(`/game/${id}`)} />
          ))}
        </div>
      )}
    </div>
  );
}
