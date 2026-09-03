import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import type { LibraryEntry, LibraryQuery, PlayStatus, SortKey } from "../types";
import { SORT_LABELS, STATUS_COLORS, STATUS_LABELS } from "../types";
import { GameCard, SkeletonCard } from "../components/GameCard";
import FilterGroup from "../components/FilterGroup";
import { formatPlaytime } from "../lib/format";
import { useApp } from "../store";

const STATUSES: PlayStatus[] = ["WantToPlay", "Playing", "Completed", "Dropped"];
// Rating, detailed rating, date added and name sit at the top of the sort
// menu; the "Other" and "By category" groups appear only when "Extended
// sorting options" is enabled in Settings.
const PRIMARY_SORTS: SortKey[] = ["stars", "score", "added", "name"];
const OTHER_SORTS: SortKey[] = ["releaseDate", "playtime", "ratedAt"];
const CATEGORY_SORTS: SortKey[] = ["gameplay", "story", "music", "technical"];
// Every sort that only exists while extended sorting is enabled.
const EXTENDED_SORTS: SortKey[] = [...OTHER_SORTS, ...CATEGORY_SORTS];

export default function Library() {
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statuses, setStatuses] = useState<Set<PlayStatus>>(new Set());
  const [favouritesOnly, setFavouritesOnly] = useState(false);
  const [genres, setGenres] = useState<string[]>([]);
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [selGenres, setSelGenres] = useState<Set<string>>(new Set());
  const [selPlatforms, setSelPlatforms] = useState<Set<string>>(new Set());
  const [minStars, setMinStars] = useState(0);
  const [minScore, setMinScore] = useState(0);
  const [sort, setSort] = useState<SortKey>("stars");
  const [sortDesc, setSortDesc] = useState(true);
  const [filterPanel, setFilterPanel] = useState(false);
  const navigate = useNavigate();
  const profile = useApp((s) => s.profile);
  const extendedSorting = useApp((s) => s.settings.extendedSorting);
  const loadSeq = useRef(0);
  // Render and query through effectiveSort: if extended sorting is switched
  // off while an extended sort is active, fall back to Rating (keeping the
  // chosen direction) without ever rendering a mismatched select.
  const effectiveSort =
    extendedSorting || !EXTENDED_SORTS.includes(sort) ? sort : "stars";

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    const q: LibraryQuery = {
      search: search.trim() || undefined,
      statuses: [...statuses],
      favouritesOnly: favouritesOnly || undefined,
      genres: [...selGenres],
      platforms: [...selPlatforms],
      minStars: minStars > 0 ? minStars : undefined,
      minScore: minScore > 0 ? minScore : undefined,
      sort: effectiveSort,
      sortDesc,
    };
    try {
      const result = await api.libraryQuery(q);
      if (seq !== loadSeq.current) return; // a newer query superseded this one
      setEntries(result);
      setError(null);
    } catch (e) {
      if (seq !== loadSeq.current) return;
      setError(String(e));
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [search, statuses, favouritesOnly, selGenres, selPlatforms, minStars, minScore, effectiveSort, sortDesc]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load, profile]);

  // Keep the raw sort state honest once extended sorting is off.
  useEffect(() => {
    if (!extendedSorting && EXTENDED_SORTS.includes(sort)) setSort("stars");
  }, [extendedSorting, sort]);

  useEffect(() => {
    let alive = true;
    api.getGenresAndPlatforms()
      .then((info) => {
        if (alive) {
          setGenres(info.genres);
          setPlatforms(info.platforms);
        }
      })
      .catch(() => {}); // the filter panel just falls back to no options
    return () => {
      alive = false;
    };
  }, [profile, entries.length]);

  const activeFilters =
    statuses.size + (favouritesOnly ? 1 : 0) + selGenres.size + selPlatforms.size +
    (minStars > 0 ? 1 : 0) + (minScore > 0 ? 1 : 0);

  function toggle<T>(set: Set<T>, v: T): Set<T> {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    return next;
  }

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
            {STATUSES.map((s) => (
              <button
                key={s}
                className={`chip py-1.5 ${statuses.has(s) ? STATUS_COLORS[s] : "bg-surface-800 text-slate-400 border-surface-600"}`}
                onClick={() => setStatuses(toggle(statuses, s))}
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
            <button
              className={`chip py-1.5 ${favouritesOnly ? "bg-rose-500/15 text-rose-300 border-rose-500/30" : "bg-surface-800 text-slate-400 border-surface-600"}`}
              onClick={() => setFavouritesOnly(!favouritesOnly)}
            >
              ♥ Favourites
            </button>
          </div>

          {(genres.length > 0 || platforms.length > 0) && (
            <div className="grid md:grid-cols-2 gap-4">
              <FilterGroup
                title="Genres"
                options={genres}
                selected={selGenres}
                onToggle={(g) => setSelGenres(toggle(selGenres, g))}
              />
              <FilterGroup
                title="Platforms"
                options={platforms}
                selected={selPlatforms}
                onToggle={(p) => setSelPlatforms(toggle(selPlatforms, p))}
              />
            </div>
          )}

          <div className="flex flex-wrap gap-8">
            <label className="text-xs text-slate-400">
              <div className="mb-1">
                Min rating: <span className="text-slate-200">{minStars}</span>
              </div>
              <input
                type="range" min={0} max={5} step={0.5}
                value={minStars}
                onChange={(e) => setMinStars(Number(e.target.value))}
                className="w-48 accent-accent-500 select-none"
              />
            </label>
            <label className="text-xs text-slate-400">
              <div className="mb-1">
                Min detailed rating: <span className="text-slate-200">{minScore}</span>
              </div>
              <input
                type="range" min={0} max={100} step={5}
                value={minScore}
                onChange={(e) => setMinScore(Number(e.target.value))}
                className="w-48 accent-accent-500 select-none"
              />
            </label>
            {activeFilters > 0 && (
              <button
                className="btn-ghost self-end text-xs"
                onClick={() => {
                  setStatuses(new Set());
                  setFavouritesOnly(false);
                  setSelGenres(new Set());
                  setSelPlatforms(new Set());
                  setMinStars(0);
                  setMinScore(0);
                }}
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
