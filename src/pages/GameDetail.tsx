import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import type { CategoryWeights, LibraryEntry } from "../types";
import { DEFAULT_WEIGHTS } from "../types";
import { useSequentialFetch } from "../hooks/useSequentialFetch";
import { StarPicker } from "../components/StarRating";
import {
  categoryScoresDirty,
  categoryScoresOf,
  emptyCategoryScores,
  type CategoryScores,
} from "../components/CategoryScoreEditor";
import DetailHeader from "../components/gameDetail/DetailHeader";
import StatusChips from "../components/gameDetail/StatusChips";
import PlaytimeDatesSection from "../components/gameDetail/PlaytimeDatesSection";
import NotesSection from "../components/gameDetail/NotesSection";
import ScoreSection from "../components/gameDetail/ScoreSection";
import DivergenceCard from "../components/gameDetail/DivergenceCard";
import { formatDate } from "../lib/format";
import { useApp } from "../store";

export default function GameDetail() {
  const { id } = useParams<{ id: string }>();
  const entryId = Number(id);
  const navigate = useNavigate();
  const profile = useApp((s) => s.profile);

  const [entry, setEntry] = useState<LibraryEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [notesDirty, setNotesDirty] = useState(false);
  const [catDraft, setCatDraft] = useState<CategoryScores>(emptyCategoryScores);
  const { begin, isCurrent } = useSequentialFetch();

  useEffect(() => {
    if (!Number.isFinite(entryId)) return;
    const seq = begin();
    api
      .getLibraryEntry(entryId)
      .then((e) => {
        if (!isCurrent(seq)) return; // navigated to another entry meanwhile
        setEntry(e);
        setNotes(e.notes);
        setCatDraft(categoryScoresOf(e));
      })
      .catch((err) => {
        if (isCurrent(seq)) setError(String(err));
      });
  }, [entryId, begin, isCurrent]);

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

  const weights: CategoryWeights = profile?.categoryWeights ?? DEFAULT_WEIGHTS;

  // Dirty = draft differs from what's actually saved, so the Save button
  // reflects reality instead of requiring a unset/re-set dance.
  const catDirty = categoryScoresDirty(catDraft, entry);

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

  async function remove() {
    try {
      await api.removeLibraryEntry(entryId);
      navigate("/library");
    } catch (e) {
      setError(String(e));
    }
  }

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
        <DetailHeader
          entry={entry}
          onToggleFavourite={() => patch({ favourite: !entry.favourite })}
          onRemove={remove}
        />

        <div className="p-6 grid md:grid-cols-2 gap-8">
          {/* left: status & journal */}
          <div className="space-y-6">
            <section>
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                Play status
              </h2>
              <StatusChips status={entry.status} onSelect={(s) => patch({ status: s })} />
            </section>

            {/* key: the playtime/date drafts reset when another entry loads */}
            <PlaytimeDatesSection key={entry.id} entry={entry} onPatch={patch} />

            <NotesSection
              notes={notes}
              dirty={notesDirty}
              onChange={(v) => {
                setNotes(v);
                setNotesDirty(true);
              }}
              onSave={saveNotes}
            />

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

            <ScoreSection
              draft={catDraft}
              onDraftChange={setCatDraft}
              weights={weights}
              dirty={dirty}
              onSave={saveAndLeave}
            />

            <DivergenceCard entry={entry} />
          </div>
        </div>
      </div>
    </div>
  );
}
