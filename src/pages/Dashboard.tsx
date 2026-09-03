import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bar,
  Cell,
  Line,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { api } from "../api";
import type { Analytics, MiniEntry, RatingMode } from "../types";
import { STATUSES, STATUS_COLORS, STATUS_LABELS } from "../types";
import ChartFrame, { useChartPalette } from "../components/dashboard/ChartFrame";
import CoverImage from "../components/CoverImage";
import { Stars } from "../components/StarRating";
import { formatPlaytime, scoreColor } from "../lib/format";
import { useSequentialFetch } from "../hooks/useSequentialFetch";
import { useApp } from "../store";

const RATING_MODES: { key: RatingMode; label: string }[] = [
  { key: "stars", label: "★ Simple" },
  { key: "detailed", label: "◆ Detailed" },
  { key: "both", label: "Both" },
];

export default function Dashboard() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ratingMode, setRatingMode] = useState<RatingMode>("both");
  const navigate = useNavigate();
  const profile = useApp((s) => s.profile);
  // Series colours from the active theme; ChartFrame derives its own via
  // useChartPalette for the axis/tooltip/grid boilerplate.
  const palette = useChartPalette();
  const { begin, isCurrent } = useSequentialFetch();

  const loadAnalytics = useCallback(async () => {
    const seq = begin();
    setError(null);
    try {
      const data = await api.getAnalytics(ratingMode);
      if (isCurrent(seq)) setAnalytics(data);
    } catch (e) {
      if (isCurrent(seq)) setError(String(e));
    }
  }, [begin, isCurrent, ratingMode]);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics, profile]);

  if (!analytics) {
    if (error) {
      return (
        <div className="p-8 max-w-6xl mx-auto space-y-6">
          <h1 className="text-xl font-semibold text-white">My gaming dashboard</h1>
          <ErrorBanner message={error} onRetry={loadAnalytics} />
        </div>
      );
    }
    return (
      <div className="p-8 max-w-6xl mx-auto space-y-4 animate-pulse">
        <div className="h-8 w-48 bg-surface-800 rounded" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 bg-surface-800 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const hasRatings = analytics.avgOverall != null || analytics.avgStars != null;

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-white">My gaming dashboard</h1>
      </div>

      {/* a background refresh (rating-mode switch) failed; keep the stale data visible */}
      {error && <ErrorBanner message={error} onRetry={loadAnalytics} />}

      {/* headline stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Games tracked" value={String(analytics.totalGames)} />
        <Stat label="Favourites" value={String(analytics.favourites)} />
        <Stat label="Total playtime" value={formatPlaytime(analytics.totalPlaytimeMinutes)} />
        <Stat
          label="Avg detailed score"
          value={analytics.avgOverall != null ? `${analytics.avgOverall.toFixed(1)} / 100` : "—"}
          accent={analytics.avgOverall != null ? scoreColor(analytics.avgOverall) : undefined}
        />
      </div>

      {/* status + star distribution */}
      <div className="grid md:grid-cols-2 gap-4">
        <Panel title="Play status">
          <div className="space-y-2">
            {STATUSES.map((s) => {
              const count = analytics.statusCounts.find((x) => x.status === s)?.count ?? 0;
              const pct = analytics.totalGames > 0 ? (count / analytics.totalGames) * 100 : 0;
              return (
                <div key={s} className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 w-24 shrink-0">{STATUS_LABELS[s]}</span>
                  <div className="flex-1 h-5 bg-surface-800 rounded overflow-hidden">
                    <div className={`h-full ${STATUS_COLORS[s].bg}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-slate-500 w-8 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel title="Star rating distribution">
          {analytics.starDistribution.some((d) => d.y > 0) ? (
            <ChartFrame kind="bar" data={analytics.starDistribution} xKey="x" yWholeNumbers>
              {/* Bar-level name/fill drive the tooltip (Cell fills only
                  colour the bars themselves; without them the tooltip shows
                  the raw dataKey in default black). */}
              <Bar dataKey="y" name="Games" fill="#34d399" radius={[4, 4, 0, 0]}>
                {analytics.starDistribution.map((d) => (
                  <Cell
                    key={d.x}
                    fill={d.x >= 3.5 ? "#34d399" : d.x >= 2 ? "#fbbf24" : "#fb7185"}
                  />
                ))}
              </Bar>
            </ChartFrame>
          ) : (
            <Empty text="No star ratings yet." />
          )}
        </Panel>
      </div>

      {!hasRatings && (
        <Panel title="Start rating games">
          <p className="text-sm text-slate-500">
            Rate a few games from your library and this dashboard fills up with distributions,
            trends and breakdowns of your taste.
          </p>
        </Panel>
      )}

      {/* category radar */}
      {hasRatings &&
        (analytics.categoryAverages.gameplay != null ||
          analytics.categoryAverages.story != null) && (
          <div className="grid md:grid-cols-2 gap-4">
            <Panel title="Category Profile">
              <ResponsiveContainer width="100%" height={220}>
                <RadarChart
                  data={[
                    { cat: "Gameplay", v: analytics.categoryAverages.gameplay ?? 0 },
                    { cat: "Story", v: analytics.categoryAverages.story ?? 0 },
                    { cat: "Music", v: analytics.categoryAverages.music ?? 0 },
                    { cat: "Technical", v: analytics.categoryAverages.technical ?? 0 },
                  ]}
                  outerRadius="70%"
                >
                  <PolarGrid stroke={palette.polarGrid} />
                  <PolarAngleAxis dataKey="cat" tick={{ fill: "#94a3b8", fontSize: 12 }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={{ fill: "#475569", fontSize: 10 }} />
                  <Radar
                    dataKey="v"
                    name="Average"
                    stroke={palette.accent}
                    fill={palette.accent}
                    fillOpacity={0.35}
                  />
                  <Tooltip
                    contentStyle={palette.tooltipStyle}
                    formatter={(value) => Number(value).toFixed(1)}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </Panel>

            <Panel title="Detailed score distribution">
              {analytics.scoreDistribution.some((d) => d.y > 0) ? (
                <ChartFrame
                  kind="bar"
                  data={analytics.scoreDistribution}
                  xKey="x"
                  xTickFontSize={10}
                  xInterval={1}
                  yWholeNumbers
                >
                  <Bar dataKey="y" name="Games" fill={palette.accent} radius={[4, 4, 0, 0]} />
                </ChartFrame>
              ) : (
                <Empty text="No detailed scores yet." />
              )}
            </Panel>
          </div>
        )}

      {/* trends */}
      {analytics.ratingTrend.length >= 2 && (
        <div className="grid md:grid-cols-2 gap-4">
          <Panel title="Rating trend — how your standards move">
            <ChartFrame
              kind="line"
              data={analytics.ratingTrend}
              xKey="month"
              yDomain={[0, 100]}
              grid
              legend
            >
              <Line
                type="monotone"
                dataKey="avgOverall"
                name="Detailed (0-100)"
                stroke={palette.accent}
                dot
              />
              <Line type="monotone" dataKey="avgStars" name="Stars (×20)" stroke="#fbbf24" dot />
            </ChartFrame>
          </Panel>
          <Panel title="Category trends — how your taste evolves">
            <ChartFrame
              kind="line"
              data={analytics.categoryTrend}
              xKey="month"
              yDomain={[0, 100]}
              grid
              legend
            >
              <Line type="monotone" dataKey="gameplay" stroke={palette.accent} dot={false} />
              <Line type="monotone" dataKey="story" stroke="#34d399" dot={false} />
              <Line type="monotone" dataKey="music" stroke="#fbbf24" dot={false} />
              <Line type="monotone" dataKey="technical" stroke="#fb7185" dot={false} />
            </ChartFrame>
          </Panel>
        </div>
      )}

      {/* first vs recent shift */}
      {analytics.firstVsRecent && (
        <Panel title="Then vs Now">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {(
              [
                ["Gameplay", "gameplay"],
                ["Story", "story"],
                ["Music", "music"],
                ["Technical", "technical"],
              ] as const
            ).map(([label, key]) => {
              const first = analytics.firstVsRecent!.firstQuartile[key];
              const recent = analytics.firstVsRecent!.recentQuartile[key];
              const delta = first != null && recent != null ? recent - first : null;
              return (
                <div key={key} className="bg-surface-800/50 rounded-xl p-4 text-center">
                  <div className="text-xs text-slate-400 mb-1">{label}</div>
                  <div className="text-2xl font-bold text-white">
                    {recent != null ? recent.toFixed(1) : "—"}
                  </div>
                  <div
                    className={`text-xs mt-1 ${
                      delta == null
                        ? "text-slate-600"
                        : delta > 1
                          ? "text-emerald-400"
                          : delta < -1
                            ? "text-rose-400"
                            : "text-slate-500"
                    }`}
                  >
                    {delta == null
                      ? "—"
                      : `${delta > 0 ? "+" : ""}${delta.toFixed(1)} since you started`}
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {/* genre breakdown + recently rated */}
      {(analytics.genreBreakdown.length > 0 || analytics.recentlyRated.length > 0) && (
        <div className="grid md:grid-cols-2 gap-4">
          <Panel title="Genres you play (top 10)">
            <BreakdownTable rows={analytics.genreBreakdown} />
          </Panel>
          <Panel title="Recently rated">
            <p className="text-xs text-slate-500 mb-3">Your three latest rated games.</p>
            <MiniList entries={analytics.recentlyRated} onOpen={(id) => navigate(`/game/${id}`)} />
          </Panel>
        </div>
      )}

      {/* extremes + divergence */}
      {(analytics.highestRated.length > 0 || analytics.lowestRated.length > 0) && (
        <div className="grid md:grid-cols-2 gap-4">
          <Panel
            title="Highest rated"
            actions={
              <div className="flex gap-1">
                {RATING_MODES.map((m) => (
                  <button
                    key={m.key}
                    className={`chip ${
                      ratingMode === m.key
                        ? "bg-accent-600/20 text-accent-400 border-accent-500/40"
                        : "bg-surface-800 text-slate-500 border-surface-600 hover:text-slate-300"
                    }`}
                    title={`Rank by ${m.label.toLowerCase()} rating`}
                    onClick={() => setRatingMode(m.key)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            }
          >
            <MiniList
              entries={analytics.highestRated}
              onOpen={(id) => navigate(`/game/${id}`)}
              mode={ratingMode}
            />
          </Panel>
          <Panel
            title="Lowest rated"
            actions={
              <span className="text-[11px] text-slate-500">
                {ratingMode === "stars"
                  ? "by star rating"
                  : ratingMode === "detailed"
                    ? "by detailed score"
                    : "needs both ratings"}
              </span>
            }
          >
            <MiniList
              entries={analytics.lowestRated}
              onOpen={(id) => navigate(`/game/${id}`)}
              mode={ratingMode}
            />
          </Panel>
        </div>
      )}

      {(analytics.gutFeelingGames.length > 0 || analytics.onReflectionGames.length > 0) && (
        <div className="grid md:grid-cols-2 gap-4">
          <Panel title="♥ Gut-feeling picks — loved more than their parts">
            <p className="text-xs text-slate-500 mb-3">
              Star rating exceeds the detailed score by 15+ points.
            </p>
            <MiniList
              entries={analytics.gutFeelingGames}
              onOpen={(id) => navigate(`/game/${id}`)}
            />
          </Panel>
          <Panel title="🧠 On-reflection picks — better than they felt">
            <p className="text-xs text-slate-500 mb-3">
              Detailed score exceeds the star rating by 15+ points.
            </p>
            <MiniList
              entries={analytics.onReflectionGames}
              onOpen={(id) => navigate(`/game/${id}`)}
            />
          </Panel>
        </div>
      )}
    </div>
  );
}

/** Chip-style load-failure banner (matches Library/Search) with a retry button. */
function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="chip bg-rose-500/10 text-rose-300 border-rose-500/30 py-1.5 flex items-center justify-between gap-3">
      <span>Could not load analytics: {message}</span>
      <button
        className="chip bg-surface-800 text-slate-300 border-surface-600 hover:text-white"
        onClick={onRetry}
      >
        Retry
      </button>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="h-[220px] flex items-center justify-center text-sm text-slate-600">{text}</div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-slate-500 uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${accent ?? "text-white"}`}>{value}</div>
    </div>
  );
}

function Panel({
  title,
  children,
  actions,
}: {
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between gap-2 mb-4">
        <h2 className="text-sm font-semibold text-slate-200">{title}</h2>
        {actions}
      </div>
      {children}
    </div>
  );
}

function BreakdownTable({ rows }: { rows: Analytics["genreBreakdown"] }) {
  if (rows.length === 0) return <Empty text="Nothing here yet." />;
  const max = Math.max(...rows.map((r) => r.count));
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-3 text-xs">
          <span className="text-slate-300 w-32 truncate" title={r.label}>
            {r.label}
          </span>
          <div className="flex-1 h-4 bg-surface-800 rounded overflow-hidden">
            <div
              className="h-full bg-accent-600/70"
              style={{ width: `${(r.count / max) * 100}%` }}
            />
          </div>
          <span className="text-slate-500 w-24 text-right">
            {r.count}
            {r.avgOverall != null && (
              <span className={scoreColor(r.avgOverall)}> · {r.avgOverall.toFixed(0)}</span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

function MiniList({
  entries,
  onOpen,
  mode = "both",
}: {
  entries: MiniEntry[];
  onOpen: (id: number) => void;
  mode?: RatingMode;
}) {
  if (entries.length === 0) return <Empty text="Nothing here yet." />;
  return (
    <div className="space-y-2">
      {entries.map((e) => (
        <button
          key={e.entryId}
          className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-surface-800 text-left transition-colors"
          onClick={() => onOpen(e.entryId)}
        >
          <CoverImage url={e.coverUrl} alt={e.name} className="w-16 h-9 object-cover rounded" />
          <span className="flex-1 text-sm text-slate-200 truncate">{e.name}</span>
          {mode !== "detailed" && <Stars value={e.stars} />}
          {mode !== "stars" && e.overall != null && (
            <span className={`text-xs font-semibold ${scoreColor(e.overall)}`}>
              {e.overall.toFixed(1)}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
