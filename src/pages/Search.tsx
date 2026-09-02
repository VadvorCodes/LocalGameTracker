import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import type { CachedGame, PlayStatus, SearchOutcome } from "../types";
import { STATUS_LABELS } from "../types";
import CoverImage from "../components/CoverImage";
import { useApp } from "../store";

const STATUSES: PlayStatus[] = ["WantToPlay", "Playing", "Completed", "Dropped"];

export default function Search() {
  const [query, setQuery] = useState("");
  const [outcome, setOutcome] = useState<SearchOutcome | null>(null);
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState<Set<number>>(new Set());
  const [adding, setAdding] = useState<number | null>(null);
  const [dropdown, setDropdown] = useState<number | null>(null);
  const [ratePrompt, setRatePrompt] = useState<{ rawgId: number; entryId: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const hasApiKey = useApp((s) => s.hasApiKey);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(async (q: string) => {
    setLoading(true);
    setError(null);
    try {
      const out = await api.searchGames(q);
      setOutcome(out);
      // Reflect what's already owned so cards show "In your library"
      // even after an app restart.
      api.libraryQuery({})
        .then((entries) => setAdded(new Set(entries.map((e) => e.rawgId))))
        .catch(() => {});
    } catch (e) {
      setError(String(e));
      setOutcome(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (!query.trim()) {
      setOutcome(null);
      return;
    }
    debounce.current = setTimeout(() => runSearch(query.trim()), 350);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query, runSearch]);

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

  const results = outcome?.games ?? [];

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-xl font-semibold text-white mb-1">Find games</h1>
      <p className="text-sm text-slate-500 mb-6">
        Searches RAWG when online; falls back to your local cache when offline.
        {!hasApiKey && (
          <span className="text-amber-400">
            {" "}
            No RAWG API key configured yet — add one in Settings for live results.
          </span>
        )}
      </p>

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
          No games found for “{query}”.
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
                {[g.releaseDate?.split("-")[0], g.developer, ...g.genres.slice(0, 2)]
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
