import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import type { CategoryWeights, LibraryEntry, PlayStatus } from "../types";
import { STATUS_COLORS, STATUS_LABELS } from "../types";
import CoverImage from "../components/CoverImage";
import { StarPicker, Stars } from "../components/StarRating";
import { HeartIcon, TrashIcon } from "../components/icons";
import { divergenceText, formatDate, formatPlaytime, scoreColor } from "../lib/format";
import { computeWeightedOverall } from "../lib/scoring";
import { useApp } from "../store";

const STATUSES: PlayStatus[] = ["WantToPlay", "Playing", "Completed", "Dropped"];

// Preset thresholds stored as exact values ("100+" saves 100 h) so sorting and
// any future filtering keep working on plain minutes. Anything else is Custom.
const HOUR_PRESETS = [5, 10, 25, 50, 100, 250, 500, 1000];
const HOURS_CUSTOM = "custom";

function hoursPresetFor(hoursStr: string): string {
  const h = Math.max(0, Math.floor(Number(hoursStr) || 0));
  if (h === 0) return "0";
  return (HOUR_PRESETS as readonly number[]).includes(h) ? String(h) : HOURS_CUSTOM;
}

const CATEGORIES = [
  { key: "gameplay", label: "Gameplay" },
  { key: "story", label: "Storytelling" },
  { key: "music", label: "Music" },
  { key: "technical", label: "Technical Performance" },
] as const;

type CatKey = (typeof CATEGORIES)[number]["key"];

export default function GameDetail() {
  const { id } = useParams<{ id: string }>();
  const entryId = Number(id);
  const navigate = useNavigate();
  const profile = useApp((s) => s.profile);

  const [entry, setEntry] = useState<LibraryEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [notesDirty, setNotesDirty] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [hours, setHours] = useState("0");
  const [hoursPreset, setHoursPreset] = useState("0");
  const [catDraft, setCatDraft] = useState<Record<CatKey, number | null>>({
    gameplay: null,
    story: null,
    music: null,
    technical: null,
  });
  // Dates are drafted locally and committed on blur: committing on every
  // keystroke let the backend round-trip clobber half-typed values.
  const [startedDraft, setStartedDraft] = useState("");
  const [finishedDraft, setFinishedDraft] = useState("");
  const [dateError, setDateError] = useState<string | null>(null);
  const loadSeq = useRef(0);

  useEffect(() => {
    if (!Number.isFinite(entryId)) return;
    const seq = ++loadSeq.current;
    api
      .getLibraryEntry(entryId)
      .then((e) => {
        if (seq !== loadSeq.current) return; // navigated to another entry meanwhile
        setEntry(e);
        setNotes(e.notes);
        const loadedHours = String(Math.floor(e.playtimeMinutes / 60));
        setHours(loadedHours);
        setHoursPreset(hoursPresetFor(loadedHours));
        setStartedDraft(e.startedAt?.slice(0, 10) ?? "");
        setFinishedDraft(e.finishedAt?.slice(0, 10) ?? "");
        setCatDraft({
          gameplay: e.gameplay,
          story: e.story,
          music: e.music,
          technical: e.technical,
        });
      })
      .catch((err) => {
        if (seq === loadSeq.current) setError(String(err));
      });
  }, [entryId]);

  if (error) {
    return (
      <div className="p-8 text-center text-slate-400 mt-16">
        Couldn’t load this entry: {error}
        <div>
          <button className="btn-ghost mt-4" onClick={() => navigate("/library")}>
            Back to library
          </button>
        </div>
      </div>
    );
  }
  if (!entry) {
    return (
      <div className="p-8 max-w-5xl mx-auto animate-pulse space-y-4">
        <div className="h-64 bg-surface-800 rounded-xl" />
      </div>
    );
  }

  const weights: CategoryWeights = profile?.categoryWeights ?? {
    gameplay: 25,
    story: 25,
    music: 25,
    technical: 25,
  };

  // Dirty = draft differs from what's actually saved, so the Save button
  // reflects reality instead of requiring a unset/re-set dance.
  const catDirty =
    catDraft.gameplay !== entry.gameplay ||
    catDraft.story !== entry.story ||
    catDraft.music !== entry.music ||
    catDraft.technical !== entry.technical;

  // Any unsaved change (score or notes) blocks the way out until "Save score".
  const dirty = catDirty || notesDirty;

  async function patch(p: Parameters<typeof api.updateLibraryEntry>[1]): Promise<boolean> {
    try {
      setEntry(await api.updateLibraryEntry(entryId, p));
      return true;
    } catch (e) {
      setError(String(e));
      return false;
    }
  }

  async function setStars(v: number | null) {
    try {
      setEntry(await api.setStarRating(entryId, v));
    } catch (e) {
      setError(String(e));
    }
  }

  async function saveAndLeave() {
    try {
      if (catDirty) setEntry(await api.setCategoryScores(entryId, catDraft));
      if (notesDirty) setEntry(await api.updateLibraryEntry(entryId, { notes }));
      navigate("/library");
    } catch (e) {
      setError(String(e));
    }
  }

  async function saveNotes() {
    // Only clear the dirty flag when the notes actually persisted, otherwise
    // the UI would claim saved state that isn't.
    if (await patch({ notes })) setNotesDirty(false);
  }

  // ISO dates compare correctly as strings. Validate the merged pair on
  // whichever field was just edited; the backend re-checks authoritatively.
  function commitDate(which: "started" | "finished") {
    const s = startedDraft;
    const f = finishedDraft;
    if (s && f && s > f) {
      setDateError("Started date cannot be after the Finished date.");
      return;
    }
    setDateError(null);
    if (which === "started") {
      if (s !== (entry?.startedAt?.slice(0, 10) ?? "")) patch({ startedAt: s });
    } else {
      if (f !== (entry?.finishedAt?.slice(0, 10) ?? "")) patch({ finishedAt: f });
    }
  }

  async function savePlaytime() {
    const h = Math.max(0, Math.floor(Number(hours) || 0));
    // An exact preset value typed into the custom field snaps back to the preset.
    setHoursPreset(hoursPresetFor(String(h)));
    await patch({ playtimeMinutes: h * 60 });
  }

  function selectHoursPreset(v: string) {
    setHoursPreset(v);
    if (v === HOURS_CUSTOM) return; // number input takes over; saved on blur
    setHours(v);
    patch({ playtimeMinutes: Number(v) * 60 });
  }

  async function remove() {
    try {
      await api.removeLibraryEntry(entryId);
      navigate("/library");
    } catch (e) {
      setError(String(e));
    }
  }

  const previewOverall = computeWeightedOverall(catDraft, weights);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <button
        className="text-sm text-slate-500 hover:text-slate-300 mb-4 disabled:opacity-40 disabled:hover:text-slate-500"
        disabled={dirty}
        title={dirty ? "Save your changes first" : undefined}
        onClick={() => navigate(-1)}
      >
        ← Back
      </button>

      <div className="card overflow-hidden">
        <div className="relative h-56">
          <CoverImage
            url={entry.coverUrl}
            alt={entry.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-surface-900 via-surface-900/40 to-transparent" />
          <div className="absolute bottom-4 left-6 right-6 flex items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-white">{entry.name}</h1>
              <p className="text-sm text-slate-400 mt-1">
                {[
                  entry.developer,
                  entry.releaseDate ? formatDate(entry.releaseDate) : null,
                  ...entry.genres.slice(0, 3),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                className={`btn ${entry.favourite ? "bg-rose-600 text-white" : "btn-ghost"}`}
                onClick={() => patch({ favourite: !entry.favourite })}
                title="Toggle favourite"
              >
                <span className="inline-flex items-center gap-1.5">
                  <HeartIcon filled={entry.favourite} />
                  {entry.favourite ? "Favourited" : "Favourite"}
                </span>
              </button>
              <button
                className="btn-ghost !text-rose-400"
                onClick={() => (confirmRemove ? remove() : setConfirmRemove(true))}
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

        <div className="p-6 grid md:grid-cols-2 gap-8">
          {/* left: status & journal */}
          <div className="space-y-6">
            <section>
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                Play status
              </h2>
              <div className="flex flex-wrap gap-2">
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    className={`chip py-1.5 px-3 ${entry.status === s ? STATUS_COLORS[s] : "bg-surface-800 text-slate-400 border-surface-600"}`}
                    onClick={() => patch({ status: s })}
                  >
                    {STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            </section>

            <section className="grid grid-cols-3 gap-4">
              <label className="text-xs text-slate-400">
                <div className="mb-1 font-semibold uppercase tracking-wide">Hours played</div>
                <select
                  className="input w-full"
                  value={hoursPreset}
                  onChange={(e) => selectHoursPreset(e.target.value)}
                >
                  <option value="0">Not tracked</option>
                  {HOUR_PRESETS.map((h) => (
                    <option key={h} value={String(h)}>
                      {h}+ hours
                    </option>
                  ))}
                  <option value={HOURS_CUSTOM}>Custom…</option>
                </select>
                {hoursPreset === HOURS_CUSTOM && (
                  <input
                    className="input w-full mt-2"
                    type="number"
                    min={0}
                    step={1}
                    value={hours}
                    onChange={(e) => setHours(e.target.value)}
                    onBlur={savePlaytime}
                    autoFocus
                  />
                )}
              </label>
              <label className="text-xs text-slate-400">
                <div className="mb-1 font-semibold uppercase tracking-wide">Started</div>
                <input
                  className="input w-full"
                  type="date"
                  value={startedDraft}
                  onChange={(e) => setStartedDraft(e.target.value)}
                  onBlur={() => commitDate("started")}
                />
              </label>
              <label className="text-xs text-slate-400">
                <div className="mb-1 font-semibold uppercase tracking-wide">Finished</div>
                <input
                  className="input w-full"
                  type="date"
                  value={finishedDraft}
                  onChange={(e) => setFinishedDraft(e.target.value)}
                  onBlur={() => commitDate("finished")}
                />
              </label>
            </section>
            {dateError && <p className="text-xs text-rose-400 -mt-3">{dateError}</p>}
            {entry.playtimeMinutes > 0 && (
              <p className="text-xs text-slate-500 -mt-3">
                Tracked: {formatPlaytime(entry.playtimeMinutes)}
              </p>
            )}

            <section>
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                Notes
              </h2>
              <textarea
                className="input w-full h-32 resize-none"
                placeholder="Private notes — what you loved, what dragged, where you stopped…"
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                  setNotesDirty(true);
                }}
              />
              {notesDirty && (
                <button className="btn-primary mt-2" onClick={saveNotes}>
                  Save notes
                </button>
              )}
            </section>

            <section className="text-xs text-slate-500 space-y-1">
              <div>Platforms: {entry.platforms.join(", ") || "—"}</div>
              <div>Genres: {entry.genres.join(", ") || "—"}</div>
              <div>Added {formatDate(entry.createdAt)}</div>
            </section>
          </div>

          {/* right: ratings */}
          <div className="space-y-8">
            <section className="bg-surface-800/50 rounded-xl p-4">
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
                Quick rating
              </h2>
              <StarPicker value={entry.starRating} onChange={setStars} />
            </section>

            <section className="bg-surface-800/50 rounded-xl p-4">
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  Detailed score
                </h2>
                <span className="text-[11px] text-slate-500">per-category, 0–100</span>
              </div>
              <div className="space-y-4">
                {CATEGORIES.map(({ key, label }) => (
                  <div key={key}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-300">
                        {label}
                        <span className="text-slate-500"> ({weights[key].toFixed(0)}%)</span>
                      </span>
                      <span className="font-mono text-slate-400">{catDraft[key] ?? "—"}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={catDraft[key] ?? 50}
                      onChange={(e) => {
                        setCatDraft({ ...catDraft, [key]: Number(e.target.value) });
                      }}
                      className={`w-full select-none ${
                        catDraft[key] != null ? "accent-accent-500" : "accent-surface-600"
                      }`}
                    />
                  </div>
                ))}
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map(({ key }) => (
                    <button
                      key={key}
                      className={`chip ${catDraft[key] != null ? "bg-accent-600/20 text-accent-400 border-accent-500/40" : "bg-surface-800 text-slate-500 border-surface-600"}`}
                      onClick={() => {
                        setCatDraft({ ...catDraft, [key]: null });
                      }}
                    >
                      {catDraft[key] != null ? `clear ${key}` : `${key}: unset`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-surface-700 flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-slate-500 uppercase tracking-wide">
                    Overall (weighted)
                  </div>
                  <div
                    className={`text-3xl font-bold ${previewOverall != null ? scoreColor(previewOverall) : "text-slate-600"}`}
                  >
                    {previewOverall != null ? previewOverall.toFixed(1) : "—"}
                    <span className="text-sm text-slate-500 font-normal"> / 100</span>
                  </div>
                </div>
                <button className="btn-primary" disabled={!dirty} onClick={saveAndLeave}>
                  {dirty ? "Save score" : "Saved"}
                </button>
              </div>
            </section>

            {entry.starRating != null && entry.computedOverall != null && (
              <section className="text-xs text-slate-400 bg-surface-800/50 rounded-xl p-4">
                <div className="flex items-center gap-4">
                  <Stars value={entry.starRating} />
                  <span className="text-slate-600">vs</span>
                  <span className={`font-semibold ${scoreColor(entry.computedOverall)}`}>
                    {entry.computedOverall.toFixed(1)}/100
                  </span>
                </div>
                <p className="mt-2 text-slate-500">
                  {divergenceText(entry.starRating, entry.computedOverall)}
                </p>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
