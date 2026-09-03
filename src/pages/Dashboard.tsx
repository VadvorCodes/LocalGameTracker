import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, PolarAngleAxis,
  PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip,
  XAxis, YAxis,
} from "recharts";
import { api } from "../api";
import type { Analytics, MiniEntry } from "../types";
import { STATUS_COLORS, STATUS_LABELS } from "../types";
import type { PlayStatus } from "../types";
import CoverImage from "../components/CoverImage";
import { Stars } from "../components/StarRating";
import { themeVars } from "../lib/themes";
import { formatPlaytime, scoreColor } from "../lib/format";
import { useApp } from "../store";

export type RatingMode = "stars" | "detailed" | "both";

const RATING_MODES: { key: RatingMode; label: string }[] = [
  { key: "stars", label: "★ Simple" },
  { key: "detailed", label: "◆ Detailed" },
  { key: "both", label: "Both" },
];

export default function Dashboard() {
  const [a, setA] = useState<Analytics | null>(null);
  const [ratingMode, setRatingMode] = useState<RatingMode>("both");
  const navigate = useNavigate();
  const profile = useApp((s) => s.profile);
  const settings = useApp((s) => s.settings);

  // Chart colours derived from the active preset (not getComputedStyle — that
  // races applyTheme's DOM write and lags one render behind a theme switch).
  const palette = useMemo(() => {
    const rgb = (name: string) => `rgb(${themeVars(settings.theme, settings.customTheme)[name]})`;
    return {
      accent: rgb("--accent-500"),
      grid: rgb("--surface-700"),
      polarGrid: rgb("--surface-600"),
      tooltipBg: rgb("--surface-800"),
      tooltipBorder: rgb("--surface-600"),
    };
  }, [settings.theme, settings.customTheme]);

  const tooltipStyle = {
    background: palette.tooltipBg,
    border: `1px solid ${palette.tooltipBorder}`,
    borderRadius: 8,
    fontSize: 12,
    color: "#e2e8f0",
  };

  useEffect(() => {
    api.getAnalytics(ratingMode).then(setA).catch(console.error);
  }, [profile, ratingMode]);

  if (!a) {
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

  const hasRatings = a.avgOverall != null || a.avgStars != null;

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-white">My gaming dashboard</h1>
      </div>

      {/* headline stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Games tracked" value={String(a.totalGames)} />
        <Stat label="Favourites" value={String(a.favourites)} />
        <Stat label="Total playtime" value={formatPlaytime(a.totalPlaytimeMinutes)} />
        <Stat
          label="Avg detailed score"
          value={a.avgOverall != null ? `${a.avgOverall.toFixed(1)} / 100` : "—"}
          accent={a.avgOverall != null ? scoreColor(a.avgOverall) : undefined}
        />
      </div>

      {/* status + star distribution */}
      <div className="grid md:grid-cols-2 gap-4">
        <Panel title="Play status">
          <div className="space-y-2">
            {(["WantToPlay", "Playing", "Completed", "Dropped"] as PlayStatus[]).map((s) => {
              const count = a.statusCounts.find((x) => x.status === s)?.count ?? 0;
              const pct = a.totalGames > 0 ? (count / a.totalGames) * 100 : 0;
              return (
                <div key={s} className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 w-24 shrink-0">
                    {STATUS_LABELS[s]}
                  </span>
                  <div className="flex-1 h-5 bg-surface-800 rounded overflow-hidden">
                    <div
                      className={`h-full ${STATUS_COLORS[s].split(" ")[0]}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs text-slate-500 w-8 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel title="Star rating distribution">
          {a.starDistribution.some((d) => d.y > 0) ? (
            <ChartWrap>
              <BarChart data={a.starDistribution}>
                <XAxis dataKey="x" tick={{ fill: "#64748b", fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fill: "#64748b", fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="y" radius={[4, 4, 0, 0]}>
                  {a.starDistribution.map((d) => (
                    <Cell key={d.x} fill={d.x >= 3.5 ? "#34d399" : d.x >= 2 ? "#fbbf24" : "#fb7185"} />
                  ))}
                </Bar>
              </BarChart>
            </ChartWrap>
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
      {hasRatings && (a.categoryAverages.gameplay != null || a.categoryAverages.story != null) && (
        <div className="grid md:grid-cols-2 gap-4">
          <Panel title="Category Profile">
            <ChartWrap>
              <RadarChart
                data={[
                  { cat: "Gameplay", v: a.categoryAverages.gameplay ?? 0 },
                  { cat: "Story", v: a.categoryAverages.story ?? 0 },
                  { cat: "Music", v: a.categoryAverages.music ?? 0 },
                  { cat: "Technical", v: a.categoryAverages.technical ?? 0 },
                ]}
                outerRadius="70%"
              >
                <PolarGrid stroke={palette.polarGrid} />
                <PolarAngleAxis dataKey="cat" tick={{ fill: "#94a3b8", fontSize: 12 }} />
                <PolarRadiusAxis domain={[0, 100]} tick={{ fill: "#475569", fontSize: 10 }} />
                <Radar dataKey="v" name="Average" stroke={palette.accent} fill={palette.accent} fillOpacity={0.35} />
                <Tooltip contentStyle={tooltipStyle} formatter={(value) => Number(value).toFixed(1)} />
              </RadarChart>
            </ChartWrap>
          </Panel>

          <Panel title="Detailed score distribution">
            {a.scoreDistribution.some((d) => d.y > 0) ? (
              <ChartWrap>
                <BarChart data={a.scoreDistribution}>
                  <XAxis dataKey="x" tick={{ fill: "#64748b", fontSize: 10 }} interval={1} />
                  <YAxis allowDecimals={false} tick={{ fill: "#64748b", fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="y" fill={palette.accent} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartWrap>
            ) : (
              <Empty text="No detailed scores yet." />
            )}
          </Panel>
        </div>
      )}

      {/* trends */}
      {a.ratingTrend.length >= 2 && (
        <div className="grid md:grid-cols-2 gap-4">
          <Panel title="Rating trend — how your standards move">
            <ChartWrap>
              <LineChart data={a.ratingTrend}>
                <CartesianGrid stroke={palette.grid} />
                <XAxis dataKey="month" tick={{ fill: "#64748b", fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fill: "#64748b", fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="avgOverall" name="Detailed (0-100)" stroke={palette.accent} dot />
                <Line type="monotone" dataKey="avgStars" name="Stars (×20)" stroke="#fbbf24" dot />
              </LineChart>
            </ChartWrap>
          </Panel>
          <Panel title="Category trends — how your taste evolves">
            <ChartWrap>
              <LineChart data={a.categoryTrend}>
                <CartesianGrid stroke={palette.grid} />
                <XAxis dataKey="month" tick={{ fill: "#64748b", fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fill: "#64748b", fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="gameplay" stroke={palette.accent} dot={false} />
                <Line type="monotone" dataKey="story" stroke="#34d399" dot={false} />
                <Line type="monotone" dataKey="music" stroke="#fbbf24" dot={false} />
                <Line type="monotone" dataKey="technical" stroke="#fb7185" dot={false} />
              </LineChart>
            </ChartWrap>
          </Panel>
        </div>
      )}

      {/* first vs recent shift */}
      {a.firstVsRecent && (
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
              const first = a.firstVsRecent!.firstQuartile[key];
              const recent = a.firstVsRecent!.recentQuartile[key];
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
      {(a.genreBreakdown.length > 0 || a.recentlyRated.length > 0) && (
        <div className="grid md:grid-cols-2 gap-4">
          <Panel title="Genres you play (top 10)">
            <BreakdownTable rows={a.genreBreakdown} />
          </Panel>
          <Panel title="Recently rated">
            <p className="text-xs text-slate-500 mb-3">
              Your three latest rated games.
            </p>
            <MiniList entries={a.recentlyRated} onOpen={(id) => navigate(`/game/${id}`)} />
          </Panel>
        </div>
      )}

      {/* extremes + divergence */}
      {(a.highestRated.length > 0 || a.lowestRated.length > 0) && (
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
            <MiniList entries={a.highestRated} onOpen={(id) => navigate(`/game/${id}`)} mode={ratingMode} />
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
            <MiniList entries={a.lowestRated} onOpen={(id) => navigate(`/game/${id}`)} mode={ratingMode} />
          </Panel>
        </div>
      )}

      {(a.gutFeelingGames.length > 0 || a.onReflectionGames.length > 0) && (
        <div className="grid md:grid-cols-2 gap-4">
          <Panel title="♥ Gut-feeling picks — loved more than their parts">
            <p className="text-xs text-slate-500 mb-3">
              Star rating exceeds the detailed score by 15+ points.
            </p>
            <MiniList entries={a.gutFeelingGames} onOpen={(id) => navigate(`/game/${id}`)} />
          </Panel>
          <Panel title="🧠 On-reflection picks — better than they felt">
            <p className="text-xs text-slate-500 mb-3">
              Detailed score exceeds the star rating by 15+ points.
            </p>
            <MiniList entries={a.onReflectionGames} onOpen={(id) => navigate(`/game/${id}`)} />
          </Panel>
        </div>
      )}
    </div>
  );
}

function ChartWrap({ children }: { children: React.ReactElement }) {
  return <ResponsiveContainer width="100%" height={220}>{children}</ResponsiveContainer>;
}

function Empty({ text }: { text: string }) {
  return <div className="h-[220px] flex items-center justify-center text-sm text-slate-600">{text}</div>;
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
            <div className="h-full bg-accent-600/70" style={{ width: `${(r.count / max) * 100}%` }} />
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
          <CoverImage
            url={e.coverUrl}
            alt={e.name}
            className="w-16 h-9 object-cover rounded"
          />
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
