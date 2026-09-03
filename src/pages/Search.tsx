import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import type { CachedGame, PlayStatus, SearchOutcome } from "../types";
import FilterGroup from "../components/FilterGroup";
import MixBar from "../components/MixBar";
import SearchResultCard from "../components/SearchResultCard";
import {
  PRESET_LABELS,
  RANK_PRESETS,
  rankGames,
  type RankPreset,
  type RankWeights,
} from "../lib/searchRank";
import { toggleSet } from "../lib/sets";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { useSequentialFetch } from "../hooks/useSequentialFetch";
import { useApp } from "../store";

const YEAR_OPTIONS: number[] = [];
for (let y = new Date().getFullYear() + 1; y >= 1970; y--) YEAR_OPTIONS.push(y);

export default function Search() {
  const [query, setQuery] = useState("");
  const [outcome, setOutcome] = useState<SearchOutcome | null>(null);
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState<Set<number>>(new Set());
  const [adding, setAdding] = useState<number | null>(null);
  const [dropdown, setDropdown] = useState<number | null>(null);
  const [ratePrompt, setRatePrompt] = useState<{ rawgId: number; entryId: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Ranking: preset chips, with Custom exposing manual weight sliders. Weight
  // and chip changes re-rank the fetched pool client-side (no refetch); only
  // the year range and the DLC toggle go back into the RAWG query.
  const [preset, setPreset] = useState<RankPreset>("balanced");
  const [customWeights, setCustomWeights] = useState<RankWeights>(RANK_PRESETS.balanced);
  // True once the user has actually moved a weight slider. Until then Custom
  // is just a doorway to the sliders, so its chip stays in the neutral
  // (unselected) style instead of the bright active one.
  const [customTouched, setCustomTouched] = useState(false);
  const [filterPanel, setFilterPanel] = useState(false);
  const [selGenres, setSelGenres] = useState<Set<string>>(new Set());
  const [selPlatforms, setSelPlatforms] = useState<Set<string>>(new Set());
  const [fromYear, setFromYear] = useState("");
  const [toYear, setToYear] = useState("");
  const [hideAdditions, setHideAdditions] = useState(true);
  const navigate = useNavigate();
  const hasApiKey = useApp((s) => s.hasApiKey);
  const profile = useApp((s) => s.profile);
  // One guard for the searches themselves, one for the added-set loads, so a
  // library refresh can never invalidate an in-flight search (or vice versa).
  // Destructure: begin/isCurrent are stable callbacks (the wrapper object is
  // not), so they are safe to key useCallback dependencies on.
  const { begin: beginSearch, isCurrent: isCurrentSearch } = useSequentialFetch();
  const { begin: beginAdded, isCurrent: isCurrentAdded } = useSequentialFetch();

  const runSearch = useCallback(
    async (q: string, fromY: string, toY: string, hide: boolean) => {
      const seq = beginSearch();
      setLoading(true);
      setError(null);
      try {
        const out = await api.searchGames(q, {
          filters: {
            fromYear: fromY ? Number(fromY) : undefined,
            toYear: toY ? Number(toY) : undefined,
            excludeAdditions: hide,
          },
        });
        if (!isCurrentSearch(seq)) return; // a newer search superseded this one
        setOutcome(out);
      } catch (e) {
        if (!isCurrentSearch(seq)) return;
        setError(String(e));
        setOutcome(null);
      } finally {
        if (isCurrentSearch(seq)) setLoading(false);
      }
    },
    [beginSearch, isCurrentSearch],
  );

  // Reflect what's already owned so cards show "In your library" even after an
  // app restart. Loaded once on mount (and again if the profile changes), plus
  // re-synced after a successful add — not after every search like before.
  const loadAdded = useCallback(async () => {
    const seq = beginAdded();
    try {
      const entries = await api.libraryQuery({});
      if (!isCurrentAdded(seq)) return;
      // Merge rather than replace so a concurrent response can never drop a
      // chip we just set optimistically in add().
      setAdded((prev) => {
        const next = new Set(prev);
        for (const e of entries) next.add(e.rawgId);
        return next;
      });
    } catch {
      // the chips just keep whatever we already know
    }
  }, [beginAdded, isCurrentAdded]);

  useEffect(() => {
    void loadAdded();
  }, [loadAdded, profile]);

  // One debounce drives the whole query: typing, the year range and the DLC
  // toggle all restart the same 350ms timer, so a burst of edits fires exactly
  // one search (memoized bundle — a fresh object per render would never settle).
  const searchInput = useMemo(
    () => ({ query, fromYear, toYear, hideAdditions }),
    [query, fromYear, toYear, hideAdditions],
  );
  const debouncedInput = useDebouncedValue(searchInput, 350);
  // Page policy: emptying the input clears results immediately instead of
  // waiting out the debounce (and never searches for whitespace).
  const effectiveQuery = query.trim() ? debouncedInput.query.trim() : "";

  useEffect(() => {
    if (!effectiveQuery) {
      setOutcome(null);
      return;
    }
    void runSearch(
      effectiveQuery,
      debouncedInput.fromYear,
      debouncedInput.toYear,
      debouncedInput.hideAdditions,
    );
  }, [effectiveQuery, debouncedInput, runSearch]);

  async function add(game: CachedGame, status: PlayStatus) {
    setAdding(game.rawgId);
    setDropdown(null);
    setError(null);
    try {
      const entry = await api.addToLibrary(game, status);
      setAdded((prev) => new Set(prev).add(game.rawgId));
      setRatePrompt({ rawgId: game.rawgId, entryId: entry.id });
      void loadAdded(); // re-sync with the library after the change
    } catch (e) {
      setError(String(e));
    } finally {
      setAdding(null);
    }
  }

  const pool = outcome?.games ?? [];
  // Memoized so the identity only changes when a weight or preset actually
  // changes, letting the results memo below depend on the object itself.
  const weights = useMemo<RankWeights>(
    () => (preset === "custom" ? customWeights : RANK_PRESETS[preset]),
    [preset, customWeights],
  );
  const results = useMemo(() => {
    const byGenre = selGenres.size
      ? pool.filter((g) => g.genres.some((x) => selGenres.has(x)))
      : pool;
    const byPlatform = selPlatforms.size
      ? byGenre.filter((g) => g.platforms.some((x) => selPlatforms.has(x)))
      : byGenre;
    return rankGames(byPlatform, query.trim(), weights);
  }, [pool, query, selGenres, selPlatforms, weights]);

  const genreOptions = useMemo(() => [...new Set(pool.flatMap((g) => g.genres))].sort(), [pool]);
  const platformOptions = useMemo(
    () => [...new Set(pool.flatMap((g) => g.platforms))].sort(),
    [pool],
  );

  const activeFilters = selGenres.size + selPlatforms.size + (fromYear ? 1 : 0) + (toYear ? 1 : 0);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-xl font-semibold text-white mb-1">Find games</h1>
      {!hasApiKey && (
        <p className="text-sm text-amber-400 mb-6">
          No RAWG API key configured yet — add one in Settings for live results.
        </p>
      )}

      <div className="relative mb-4">
        <input
          className="input w-full !py-3 !text-base"
          placeholder="Search for a game…"
          value={query}
          autoFocus
          onChange={(e) => setQuery(e.target.value)}
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">
            searching…
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {(Object.keys(PRESET_LABELS) as RankPreset[]).map((p) => {
          const active = p === "custom" ? preset === "custom" && customTouched : p === preset;
          return (
            <button
              key={p}
              className={`chip py-1.5 ${active ? "bg-accent-600/20 text-accent-400 border-accent-500/40" : "bg-surface-800 text-slate-400 border-surface-600 hover:text-slate-300"}`}
              onClick={() => {
                setPreset(p);
                // The panel hosts the manual weight sliders — entering Custom
                // reveals it, leaving Custom hides it again. Switching between
                // two non-custom presets leaves the panel alone.
                if (p === "custom") setFilterPanel(true);
                else if (preset === "custom") setFilterPanel(false);
              }}
            >
              {PRESET_LABELS[p]}
            </button>
          );
        })}
        <span className="flex-1" />
        <button
          className={`chip py-1.5 ${hideAdditions ? "bg-accent-600/20 text-accent-400 border-accent-500/40" : "bg-surface-800 text-slate-400 border-surface-600"}`}
          title="Excludes DLC, special editions and remasters from results"
          onClick={() => setHideAdditions(!hideAdditions)}
        >
          Hide DLC &amp; editions
        </button>
        <button
          className={`btn ${filterPanel || activeFilters ? "bg-accent-600 text-white" : "btn-ghost"}`}
          onClick={() => setFilterPanel(!filterPanel)}
        >
          Filters{activeFilters ? ` (${activeFilters})` : ""}
        </button>
      </div>

      {filterPanel && (
        <div className="card p-4 mb-6 space-y-4">
          {preset === "custom" && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold text-slate-400">Ranking mix</div>
                {customTouched && (
                  <button
                    className="btn-ghost text-xs"
                    onClick={() => {
                      setCustomWeights(RANK_PRESETS.balanced);
                      setCustomTouched(false);
                    }}
                  >
                    Reset
                  </button>
                )}
              </div>
              <MixBar
                weights={customWeights}
                onChange={(w) => {
                  setPreset("custom");
                  setCustomTouched(true);
                  setCustomWeights(w);
                }}
              />
            </div>
          )}

          <div className="flex flex-wrap items-end gap-4">
            <label className="text-xs text-slate-400">
              <div className="mb-1">Released from</div>
              <select
                className="input"
                value={fromYear}
                onChange={(e) => setFromYear(e.target.value)}
              >
                <option value="">Any</option>
                {YEAR_OPTIONS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-slate-400">
              <div className="mb-1">Released to</div>
              <select className="input" value={toYear} onChange={(e) => setToYear(e.target.value)}>
                <option value="">Any</option>
                {YEAR_OPTIONS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            {activeFilters > 0 && (
              <button
                className="btn-ghost text-xs"
                onClick={() => {
                  setSelGenres(new Set());
                  setSelPlatforms(new Set());
                  setFromYear("");
                  setToYear("");
                }}
              >
                Clear all
              </button>
            )}
          </div>

          {(genreOptions.length > 0 || platformOptions.length > 0) && (
            <div className="grid md:grid-cols-2 gap-4">
              <FilterGroup
                title="Genres"
                options={genreOptions}
                selected={selGenres}
                onToggle={(g) => setSelGenres(toggleSet(selGenres, g))}
              />
              <FilterGroup
                title="Platforms"
                options={platformOptions}
                selected={selPlatforms}
                onToggle={(p) => setSelPlatforms(toggleSet(selPlatforms, p))}
              />
            </div>
          )}
        </div>
      )}

      {outcome?.source === "cache" && (
        <div className="mb-4 chip bg-amber-500/10 text-amber-300 border-amber-500/30 py-1.5">
          Offline — showing results from your local cache
        </div>
      )}
      {error && (
        <div className="mb-4 chip bg-rose-500/10 text-rose-300 border-rose-500/30 py-1.5">
          {error}
        </div>
      )}

      {!query.trim() && (
        <div className="text-center text-slate-600 text-sm mt-24">
          Start typing to search the RAWG catalogue of 900,000+ games.
        </div>
      )}

      {query.trim() && !loading && results.length === 0 && !error && (
        <div className="text-center text-slate-600 text-sm mt-24">
          {pool.length > 0 ? "No results match your filters." : `No games found for “${query}”.`}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-2">
        {results.map((g) => (
          <SearchResultCard
            key={g.rawgId}
            game={g}
            inLibrary={added.has(g.rawgId)}
            adding={adding === g.rawgId}
            dropdownOpen={dropdown === g.rawgId}
            ratePrompt={ratePrompt?.rawgId === g.rawgId}
            onToggleDropdown={() => setDropdown(dropdown === g.rawgId ? null : g.rawgId)}
            onAdd={(status) => void add(g, status)}
            onRateNow={() => ratePrompt && navigate(`/game/${ratePrompt.entryId}`)}
            onRateLater={() => setRatePrompt(null)}
            onOpenLibrary={() => navigate("/library")}
          />
        ))}
      </div>
    </div>
  );
}
