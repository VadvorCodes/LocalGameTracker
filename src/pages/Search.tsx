import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import type { CachedGame, PlayStatus, SearchOutcome } from "../types";
import { STATUSES, STATUS_LABELS } from "../types";
import CoverImage from "../components/CoverImage";
import FilterGroup from "../components/FilterGroup";
import MixBar from "../components/MixBar";
import {
  PRESET_LABELS,
  RANK_PRESETS,
  rankGames,
  type RankPreset,
  type RankWeights,
} from "../lib/searchRank";
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
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeq = useRef(0);

  const runSearch = useCallback(async (q: string, fromY: string, toY: string, hide: boolean) => {
    const seq = ++searchSeq.current;
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
      if (seq !== searchSeq.current) return; // a newer search superseded this one
      setOutcome(out);
      // Reflect what's already owned so cards show "In your library"
      // even after an app restart.
      api
        .libraryQuery({})
        .then((entries) => setAdded(new Set(entries.map((e) => e.rawgId))))
        .catch(() => {});
    } catch (e) {
      if (seq !== searchSeq.current) return;
      setError(String(e));
      setOutcome(null);
    } finally {
      if (seq === searchSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (!query.trim()) {
      setOutcome(null);
      return;
    }
    debounce.current = setTimeout(
      () => runSearch(query.trim(), fromYear, toYear, hideAdditions),
      350,
    );
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query, fromYear, toYear, hideAdditions, runSearch]);

  async function add(game: CachedGame, status: PlayStatus) {
    setAdding(game.rawgId);
    setDropdown(null);
    setError(null);
    try {
      const entry = await api.addToLibrary(game, status);
      setAdded((prev) => new Set(prev).add(game.rawgId));
      setRatePrompt({ rawgId: game.rawgId, entryId: entry.id });
    } catch (e) {
      setError(String(e));
    } finally {
      setAdding(null);
    }
  }

  const pool = outcome?.games ?? [];
  const weights = preset === "custom" ? customWeights : RANK_PRESETS[preset];
  const results = useMemo(() => {
    const byGenre = selGenres.size
      ? pool.filter((g) => g.genres.some((x) => selGenres.has(x)))
      : pool;
    const byPlatform = selPlatforms.size
      ? byGenre.filter((g) => g.platforms.some((x) => selPlatforms.has(x)))
      : byGenre;
    return rankGames(byPlatform, query.trim(), weights);
    // weights is a fresh object in custom mode per render; key on its values
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool, query, selGenres, selPlatforms, weights.text, weights.popularity, weights.recency]);

  const genreOptions = useMemo(() => [...new Set(pool.flatMap((g) => g.genres))].sort(), [pool]);
  const platformOptions = useMemo(
    () => [...new Set(pool.flatMap((g) => g.platforms))].sort(),
    [pool],
  );

  const activeFilters = selGenres.size + selPlatforms.size + (fromYear ? 1 : 0) + (toYear ? 1 : 0);

  function toggle<T>(set: Set<T>, v: T): Set<T> {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    return next;
  }

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
                onToggle={(g) => setSelGenres(toggle(selGenres, g))}
              />
              <FilterGroup
                title="Platforms"
                options={platformOptions}
                selected={selPlatforms}
                onToggle={(p) => setSelPlatforms(toggle(selPlatforms, p))}
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
          <div key={g.rawgId} className="card overflow-hidden relative group">
            <div className="aspect-[16/9] overflow-hidden">
              <CoverImage url={g.coverUrl} alt={g.name} className="w-full h-full object-cover" />
            </div>
            <div className="p-3">
              <h3 className="font-medium text-sm text-slate-100 truncate" title={g.name}>
                {g.name}
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                {[
                  g.releaseDate?.split("-")[0],
                  g.developer,
                  ...g.genres.slice(0, 2),
                  g.metacritic != null ? `MC ${g.metacritic}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>

              {added.has(g.rawgId) ? (
                ratePrompt?.rawgId === g.rawgId ? (
                  <div className="mt-3 space-y-1.5">
                    <p className="text-xs text-slate-400 text-center">Rate it now?</p>
                    <div className="flex gap-1.5">
                      <button
                        className="btn-primary flex-1 !py-1.5 !text-xs"
                        onClick={() => navigate(`/game/${ratePrompt.entryId}`)}
                      >
                        Rate now
                      </button>
                      <button
                        className="btn-ghost flex-1 !py-1.5 !text-xs"
                        onClick={() => setRatePrompt(null)}
                      >
                        Later
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    className="btn-ghost w-full mt-3 !text-emerald-400"
                    onClick={() => navigate("/library")}
                  >
                    ✓ In your library — view
                  </button>
                )
              ) : (
                <div className="relative mt-3">
                  <button
                    className="btn-primary w-full"
                    disabled={adding === g.rawgId}
                    onClick={() => setDropdown(dropdown === g.rawgId ? null : g.rawgId)}
                  >
                    {adding === g.rawgId ? "Adding…" : "+ Add to library"}
                  </button>
                  {dropdown === g.rawgId && (
                    <div className="absolute bottom-full mb-1 left-0 right-0 card overflow-hidden z-10 shadow-xl">
                      {STATUSES.map((s) => (
                        <button
                          key={s}
                          className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-surface-800"
                          onClick={() => add(g, s)}
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
        ))}
      </div>
    </div>
  );
}
