import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import type { LibraryEntry, PlayStatus, RerateDecision, ReratePoolItem } from "../types";
import CoverImage from "../components/CoverImage";
import { Stars } from "../components/StarRating";
import { scoreColor } from "../lib/format";
import SwipeCard from "../components/rerate/SwipeCard";
import MatchCard from "../components/rerate/MatchCard";
import RerateRatingPanel from "../components/rerate/RerateRatingPanel";

type Phase = "idle" | "loading" | "swipe" | "review" | "rerate" | "done";
type Scope = "played" | "finished";

const SCOPE_KEY = "rerate_scope";

const SCOPE_STATUSES: Record<Scope, PlayStatus[]> = {
  played: ["Playing", "Completed", "Dropped"],
  finished: ["Completed", "Dropped"],
};

const SCOPE_LABELS: Record<Scope, string> = {
  played: "All played games",
  finished: "Completed & dropped only",
};

export default function RerateMode() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [scope, setScope] = useState<Scope>(
    // validate the persisted value — a corrupted entry must fall back, not
    // flow undefined statuses into the backend queries
    () => (localStorage.getItem(SCOPE_KEY) === "finished" ? "finished" : "played"),
  );
  const [scopeRows, setScopeRows] = useState<LibraryEntry[] | null>(null);
  const [pool, setPool] = useState<ReratePoolItem[]>([]);
  const [decisions, setDecisions] = useState<Record<number, RerateDecision>>({});
  const [swipeIdx, setSwipeIdx] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [exitRequest, setExitRequest] = useState<RerateDecision | null>(null);
  const [rerateQueue, setRerateQueue] = useState<ReratePoolItem[]>([]);
  const [rerateIdx, setRerateIdx] = useState(0);
  const [summary, setSummary] = useState({ rerated: 0, skipped: 0 });
  const [error, setError] = useState<string | null>(null);
  // True after "Back to swiping" — the pile is then re-swiped fresh while the
  // squares (buttons + progress bar) show what was chosen last time.
  const [revisiting, setRevisiting] = useState(false);
  // Snapshot of the decisions made before the current (re)pass started.
  const [previousDecisions, setPreviousDecisions] = useState<Record<number, RerateDecision>>({});
  // Pile order as entry ids: piles render in this sequence and the re-rate
  // queue keeps it, so dragging rows around changes the re-rating order.
  const [order, setOrder] = useState<number[]>([]);
  const [dragId, setDragId] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    pile: RerateDecision;
    index: number;
    edge: "top" | "left" | null;
  } | null>(null);

  // Setup-screen counts, from the same rule the backend applies to build the
  // pool: in scope and not tagged "Recently Rerated". Rows include the tag, so
  // eligible/cooling are exact rather than an upper bound.
  useEffect(() => {
    if (phase !== "idle") return;
    let alive = true;
    api
      .libraryQuery({ statuses: SCOPE_STATUSES[scope], sort: "name" })
      .then((rows) => alive && setScopeRows(rows))
      .catch(() => alive && setScopeRows(null));
    return () => {
      alive = false;
    };
  }, [phase, scope]);

  function changeScope(s: Scope) {
    setScope(s);
    localStorage.setItem(SCOPE_KEY, s);
  }

  function resetToIdle() {
    setPhase("idle");
    setPool([]);
    setDecisions({});
    setSwipeIdx(0);
    setDragX(0);
    setExitRequest(null);
    setRerateQueue([]);
    setRerateIdx(0);
    setSummary({ rerated: 0, skipped: 0 });
    setError(null);
    setRevisiting(false);
    setPreviousDecisions({});
    setOrder([]);
    setDragId(null);
    setDropTarget(null);
  }

  async function startCycle() {
    setPhase("loading");
    setError(null);
    try {
      const items = await api.startRerateSession(SCOPE_STATUSES[scope]);
      if (items.length === 0) {
        setError("No games are in scope right now — add some games to this scope first.");
        setPhase("idle");
        return;
      }
      setPool(items);
      setDecisions({});
      setOrder(items.map((i) => i.entry.id));
      setSwipeIdx(0);
      setDragX(0);
      setExitRequest(null);
      setRevisiting(false);
      setPreviousDecisions({});
      setPhase("swipe");
    } catch (e) {
      setError(String(e));
      setPhase("idle");
    }
  }

  const requestDecision = useCallback(
    (d: RerateDecision) => {
      if (exitRequest) return; // a card is already flying out
      setExitRequest(d);
    },
    [exitRequest],
  );

  // Arrow keys mirror the swipe gestures.
  useEffect(() => {
    if (phase !== "swipe") return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") requestDecision("rerate");
      if (e.key === "ArrowRight") requestDecision("keep");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, requestDecision]);

  function cardDecided(d: RerateDecision) {
    const item = pool[swipeIdx];
    if (item) setDecisions((prev) => ({ ...prev, [item.entry.id]: d }));
    setExitRequest(null);
    setDragX(0);
    if (swipeIdx + 1 >= pool.length) setPhase("review");
    else setSwipeIdx(swipeIdx + 1);
  }

  const byId = new Map(pool.map((i) => [i.entry.id, i]));
  const itemsFor = (d: RerateDecision) =>
    order.filter((id) => decisions[id] === d).map((id) => byId.get(id)!);
  const rerateItems = itemsFor("rerate");
  const keepItems = itemsFor("keep");

  // Drop `id` into `pile` at `index`: the game joins the pile (its decision
  // flips) at that position; everything else keeps its relative order.
  function moveTo(id: number, pile: RerateDecision, index: number) {
    setDecisions((prev) => ({ ...prev, [id]: pile }));
    setOrder((prev) => {
      const pileIds = prev.filter((oid) => oid !== id && decisions[oid] === pile);
      const resequenced = [...pileIds.slice(0, index), id, ...pileIds.slice(index)];
      const rest = prev.filter((oid) => oid !== id && decisions[oid] !== pile);
      return [...rest, ...resequenced];
    });
  }

  function handleDragOver(pile: RerateDecision, index: number, edge: "top" | "left" | null) {
    setDropTarget((prev) =>
      prev && prev.pile === pile && prev.index === index && prev.edge === edge
        ? prev
        : { pile, index, edge },
    );
  }

  function handleDragEnd() {
    setDragId(null);
    setDropTarget(null);
  }

  function handleDrop(id: number, pile: RerateDecision, index: number) {
    handleDragEnd();
    if (byId.has(id)) moveTo(id, pile, index);
  }

  function confirmReview() {
    setRerateQueue(rerateItems);
    setRerateIdx(0);
    setPhase(rerateItems.length > 0 ? "rerate" : "done");
  }

  function finishGame(saved: boolean) {
    setSummary((s) => ({
      rerated: s.rerated + (saved ? 1 : 0),
      skipped: s.skipped + (saved ? 0 : 1),
    }));
    if (rerateIdx + 1 >= rerateQueue.length) setPhase("done");
    else setRerateIdx(rerateIdx + 1);
  }

  if (phase === "loading") {
    return (
      <div className="h-full flex items-center justify-center text-slate-500">
        Shuffling your library…
      </div>
    );
  }

  if (phase === "swipe") {
    const item = pool[swipeIdx];
    const decidedCount = Object.keys(decisions).length;
    return (
      <div className="h-full flex flex-col relative overflow-hidden">
        <SwipeBackdrop dragX={dragX} />
        <div className="relative p-6 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-white">Re-Rate Mode</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Game {swipeIdx + 1} of {pool.length} · {decidedCount} categorised
            </p>
          </div>
          <button className="btn-ghost !py-1.5 text-xs" onClick={resetToIdle}>
            Cancel cycle
          </button>
        </div>
        <div className="relative px-6 flex gap-1">
          {pool.map((i) => {
            const d = decisions[i.entry.id];
            const prev = previousDecisions[i.entry.id];
            return (
              <div key={i.entry.id} className="flex-1 flex flex-col items-center gap-1.5">
                <div
                  className={`h-1.5 w-full rounded-full transition-colors ${
                    d === "rerate"
                      ? "bg-rose-500"
                      : d === "keep"
                        ? "bg-emerald-500"
                        : "bg-surface-700"
                  }`}
                />
                <div
                  className={`h-2.5 w-2.5 rounded-sm transition-colors ${
                    revisiting && prev
                      ? prev === "rerate"
                        ? "bg-rose-500"
                        : "bg-emerald-500"
                      : "bg-transparent"
                  }`}
                />
              </div>
            );
          })}
        </div>

        <div className="relative flex-1 flex flex-col items-center justify-center gap-5 px-6 min-h-0 overflow-y-auto">
          <SwipeCard
            key={item.entry.id}
            item={item}
            exitRequest={exitRequest}
            onDecided={cardDecided}
            onDragX={setDragX}
          />

          <p className="text-xs text-slate-500 text-center">
            Drag the card left to re-rate it, right to keep its rating — or use the
            buttons / arrow keys.
          </p>

          <div
            className="flex gap-8 items-start transition-opacity duration-150"
            style={{ opacity: dragX !== 0 ? 0 : 1 }}
          >
            <DecisionButton
              kind="rerate"
              label="✕ Re-rate"
              previous={previousDecisions[item.entry.id]}
              showIndicator={revisiting}
              onClick={() => requestDecision("rerate")}
            />
            <DecisionButton
              kind="keep"
              label="✓ Keep rating"
              previous={previousDecisions[item.entry.id]}
              showIndicator={revisiting}
              onClick={() => requestDecision("keep")}
            />
          </div>

          <div
            className="transition-opacity duration-150"
            style={{ opacity: dragX !== 0 ? 0 : 1 }}
          >
            {item.similar.length > 0 && (
              <div className="max-w-3xl">
                <h3 className="text-[11px] uppercase tracking-wide text-slate-500 mb-2 text-center">
                  Closest genre matches in your library
                </h3>
                <div className="flex gap-3 justify-center">
                  {item.similar.map((s) => (
                    <MatchCard key={s.id} entry={s} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (phase === "review") {
    return (
      <div className="p-8 max-w-4xl mx-auto space-y-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-white">Cycle review</h1>
            <p className="text-sm text-slate-500 mt-1">
              Click a game to move it between piles, or drag it — dragging within a pile
              reorders it, which is the order the re-rating follows.
            </p>
          </div>
          <button
            className="btn-ghost"
            onClick={() => {
              // Squares keep showing what was chosen; the pile itself is
              // re-swiped from scratch (rectangles start gray again).
              setPreviousDecisions(decisions);
              setDecisions({});
              setSwipeIdx(0);
              setExitRequest(null);
              setDragX(0);
              setRevisiting(true);
              setPhase("swipe");
            }}
          >
            ← Back to swiping
          </button>
        </header>

        <PileList
          title={`Re-rate — ${rerateItems.length}`}
          tone="rose"
          items={rerateItems}
          draggedId={dragId}
          dropIndex={dropTarget?.pile === "rerate" ? dropTarget.index : null}
          dropEdge={dropTarget?.pile === "rerate" ? dropTarget.edge : null}
          onToggle={(id) => setDecisions((p) => ({ ...p, [id]: "keep" }))}
          onDragOver={(index, edge) => handleDragOver("rerate", index, edge)}
          onDropItem={(id, index) => handleDrop(id, "rerate", index)}
          onDragStart={setDragId}
          onDragEnd={handleDragEnd}
        />
        <PileList
          title={`Keep rating — ${keepItems.length}`}
          tone="emerald"
          items={keepItems}
          draggedId={dragId}
          dropIndex={dropTarget?.pile === "keep" ? dropTarget.index : null}
          dropEdge={dropTarget?.pile === "keep" ? dropTarget.edge : null}
          onToggle={(id) => setDecisions((p) => ({ ...p, [id]: "rerate" }))}
          onDragOver={(index, edge) => handleDragOver("keep", index, edge)}
          onDropItem={(id, index) => handleDrop(id, "keep", index)}
          onDragStart={setDragId}
          onDragEnd={handleDragEnd}
        />

        <div className="flex justify-end">
          <button className="btn-primary" onClick={confirmReview}>
            {rerateItems.length > 0 ? "Confirm & start re-rating" : "Confirm & finish"}
          </button>
        </div>
      </div>
    );
  }

  if (phase === "rerate") {
    const item = rerateQueue[rerateIdx];
    return (
      <div className="p-4 sm:p-8 max-w-4xl mx-auto h-full flex flex-col">
        <header className="mb-6">
          <h1 className="text-xl font-semibold text-white">Re-rating</h1>
          <p className="text-sm text-slate-500 mt-1">
            Game {rerateIdx + 1} of {rerateQueue.length} — update the scores that no
            longer feel right. Skipped games keep their rating and stay eligible for
            future cycles.
          </p>
        </header>
        <div className="flex-1 flex items-start justify-center">
          <RerateRatingPanel
            key={item.entry.id}
            entry={item.entry}
            onSaved={() => finishGame(true)}
            onSkipped={() => finishGame(false)}
          />
        </div>
      </div>
    );
  }

  if (phase === "done") {
    const kept = pool.length - summary.rerated - summary.skipped;
    return (
      <div className="p-8 max-w-xl mx-auto h-full flex flex-col items-center justify-center text-center space-y-6">
        <div className="text-5xl">🎉</div>
        <div>
          <h1 className="text-xl font-semibold text-white">Cycle complete</h1>
          <p className="text-sm text-slate-500 mt-2">
            {summary.rerated} re-rated · {summary.skipped} skipped · {kept} kept their
            rating. Re-rated games sit out the next cycle, then become eligible again.
          </p>
        </div>
        <div className="flex gap-3">
          <Link to="/library" className="btn-primary">
            Back to Library
          </Link>
          <button className="btn-ghost" onClick={resetToIdle}>
            Start another cycle
          </button>
        </div>
      </div>
    );
  }

  // phase === "idle"
  const inScope = scopeRows?.length ?? 0;
  const cooling = scopeRows?.filter((r) => r.reratedAt).length ?? 0;
  const eligible = inScope - cooling;
  // The backend builds the pool from eligible games; a fully-cooled scope
  // revives from the whole scope instead, so mirror that in the preview.
  const poolBasis = eligible >= 2 ? eligible : inScope;
  const cycleSize = Math.min(10, Math.max(1, Math.floor(poolBasis / 2)));
  return (
    <div className="p-8 max-w-2xl mx-auto h-full flex flex-col">
      <h1 className="text-xl font-semibold text-white">Re-Rate Mode</h1>
      <p className="text-sm text-slate-500 mt-2 leading-relaxed">
        Revisit old ratings with fresh eyes. A cycle shows you {cycleSize} of your games
        one at a time — swipe left on the ones whose rating no longer feels right, right
        on the ones you stand by. Afterwards you re-rate the left pile individually.
        Games you re-rate sit out the next cycle.
      </p>

      <div className="card p-5 mt-6 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-200 mb-2">Which games are eligible?</h2>
          <div className="flex rounded-lg border border-surface-600 overflow-hidden w-fit">
            {(["played", "finished"] as Scope[]).map((s) => (
              <button
                key={s}
                className={`px-4 py-2 text-sm transition-colors ${
                  scope === s
                    ? "bg-accent-600 text-white"
                    : "bg-surface-800 text-slate-400 hover:text-slate-200"
                }`}
                onClick={() => changeScope(s)}
              >
                {SCOPE_LABELS[s]}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-slate-500">
          {scopeRows != null
            ? `${eligible} game${eligible === 1 ? "" : "s"} ready to re-rate${
                cooling > 0 ? ` · ${cooling} cooling down from your last cycle` : ""
              }${
                poolBasis >= 10
                  ? " — cycles of 10"
                  : poolBasis >= 2
                    ? ` — cycles of ${cycleSize}`
                    : ""
              }.`
            : "Counting eligible games…"}
        </p>
        <button
          className="btn bg-surface-800 hover:bg-accent-600 text-slate-300 hover:text-white"
          disabled={inScope < 2}
          onClick={startCycle}
        >
          Start cycle
        </button>
        {inScope < 2 && (
          <p className="text-xs text-amber-400">
            You need at least 2 games in scope to start a cycle.
          </p>
        )}
        {inScope >= 2 && eligible < 2 && (
          <p className="text-xs text-amber-400">
            Everything in scope is cooling down — starting now resets the cooldown
            and puts all {inScope} games back in the pool.
          </p>
        )}
        {error && <p className="text-xs text-rose-400">{error}</p>}
      </div>
    </div>
  );
}

/** Swipe-phase decision button. When revisiting (after "Back to swiping") a
 * small square appears under the side chosen last time, as a reminder — the
 * pass itself is fresh, so both buttons stay active. */
function DecisionButton({
  kind,
  label,
  previous,
  showIndicator,
  onClick,
}: {
  kind: RerateDecision;
  label: string;
  previous: RerateDecision | undefined;
  showIndicator: boolean;
  onClick: () => void;
}) {
  const isRerate = kind === "rerate";
  const marked = showIndicator && previous === kind;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        className={isRerate ? "btn-danger" : "btn bg-emerald-600 hover:bg-emerald-500 text-white"}
        onClick={onClick}
      >
        {label}
      </button>
      <div
        className={`h-2.5 w-2.5 rounded-sm transition-colors ${
          marked ? (isRerate ? "bg-rose-500" : "bg-emerald-500") : "bg-transparent"
        }`}
        title={marked ? "Chosen last time" : undefined}
      />
    </div>
  );
}

/** Red / green swipe-direction backdrop. The label repeats vertically down the
 * full height of each side (so it reads at any window size) and sits behind
 * the tint, out of the card's travel path at the sides. */
function SwipeBackdrop({ dragX }: { dragX: number }) {
  const left = Math.min(1, Math.max(0, -dragX) / 160);
  const right = Math.min(1, Math.max(0, dragX) / 160);
  return (
    <div className="absolute inset-0 pointer-events-none flex overflow-hidden">
      <div
        className="flex-1 flex flex-col items-center justify-around py-4 bg-rose-600"
        style={{ opacity: left * 0.2 }}
      >
        {[0, 1, 2, 3].map((k) => (
          <span
            key={k}
            className="whitespace-nowrap text-4xl font-black tracking-widest text-rose-400"
            style={{ opacity: Math.min(1, left * 1.6), transform: "rotate(-8deg)" }}
          >
            RE-RATE
          </span>
        ))}
      </div>
      <div
        className="flex-1 flex flex-col items-center justify-around py-4 bg-emerald-600"
        style={{ opacity: right * 0.2 }}
      >
        {[0, 1, 2, 3].map((k) => (
          <span
            key={k}
            className="whitespace-nowrap text-4xl font-black tracking-widest text-emerald-400"
            style={{ opacity: Math.min(1, right * 1.6), transform: "rotate(8deg)" }}
          >
            KEEP RATING
          </span>
        ))}
      </div>
    </div>
  );
}

function PileList({
  title,
  tone,
  items,
  draggedId,
  dropIndex,
  dropEdge,
  onToggle,
  onDragOver,
  onDropItem,
  onDragStart,
  onDragEnd,
}: {
  title: string;
  tone: "rose" | "emerald";
  items: ReratePoolItem[];
  draggedId: number | null;
  dropIndex: number | null;
  dropEdge: "top" | "left" | null;
  onToggle: (entryId: number) => void;
  onDragOver: (index: number, edge: "top" | "left" | null) => void;
  onDropItem: (entryId: number, index: number) => void;
  onDragStart: (entryId: number) => void;
  onDragEnd: () => void;
}) {
  // Where a drop would land. An item under the pointer splits at its centre:
  // left half = before it, right half = after it. Between rows, the vertical
  // midpoints decide. `edge` picks which side of the target the line draws on
  // (null = appending, the pile ring alone marks the spot).
  function dropIndexAt(e: React.DragEvent): { index: number; edge: "top" | "left" | null } {
    const rows = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("[data-pile-row]"));
    const rects = rows.map((r) => r.getBoundingClientRect());
    const sameRow = (a: number, b: number) => Math.abs(rects[a].top - rects[b].top) < 4;

    let over = -1;
    for (let k = 0; k < rows.length; k++) {
      const r = rects[k];
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        over = k;
        break;
      }
    }

    if (over >= 0) {
      if (e.clientX <= rects[over].left + rects[over].width / 2) {
        return { index: over, edge: over > 0 && sameRow(over - 1, over) ? "left" : "top" };
      }
      const after = over + 1;
      if (after >= rows.length) return { index: after, edge: null };
      return { index: after, edge: sameRow(over, after) ? "left" : "top" };
    }

    let i = rows.length;
    for (let k = 0; k < rows.length; k++) {
      if (e.clientY < rects[k].top + rects[k].height / 2) {
        i = k;
        break;
      }
    }
    if (i >= rows.length) return { index: i, edge: null };
    return { index: i, edge: i > 0 && sameRow(i - 1, i) ? "left" : "top" };
  }

  return (
    <section
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const { index, edge } = dropIndexAt(e);
        onDragOver(index, edge);
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDropItem(Number(e.dataTransfer.getData("text/plain")), dropIndexAt(e).index);
      }}
    >
      <h2
        className={`text-sm font-semibold mb-3 ${
          tone === "rose" ? "text-rose-300" : "text-emerald-300"
        }`}
      >
        {title}
      </h2>
      {items.length === 0 ? (
        <p
          className={`text-xs text-slate-600 p-3 rounded-lg transition-shadow ${
            dropIndex != null ? "ring-1 ring-accent-500/50" : ""
          }`}
        >
          Nothing here — drop a game to file it.
        </p>
      ) : (
        <div
          className={`grid grid-cols-1 md:grid-cols-2 gap-2 rounded-lg transition-shadow ${
            dropIndex != null ? "ring-1 ring-accent-500/40" : ""
          }`}
        >
          {items.map(({ entry }) => (
            <PileRow
              key={entry.id}
              entry={entry}
              dragging={draggedId === entry.id}
              dropBefore={dropIndex != null && dropEdge != null && items[dropIndex]?.entry.id === entry.id}
              dropEdge={dropEdge}
              onToggle={onToggle}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function PileRow({
  entry,
  dragging,
  dropBefore,
  dropEdge,
  onToggle,
  onDragStart,
  onDragEnd,
}: {
  entry: LibraryEntry;
  dragging: boolean;
  dropBefore: boolean;
  dropEdge: "top" | "left" | null;
  onToggle: (id: number) => void;
  onDragStart: (id: number) => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      className={`border-2 border-transparent ${
        dropBefore ? (dropEdge === "left" ? "border-l-accent-500" : "border-t-accent-500") : ""
      }`}
    >
      <button
        data-pile-row
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", String(entry.id));
          onDragStart(entry.id);
        }}
        onDragEnd={onDragEnd}
        className={`card w-full p-2 flex items-center gap-3 text-left hover:border-accent-500/50 transition-colors ${
          dragging ? "opacity-40" : ""
        }`}
        onClick={() => onToggle(entry.id)}
        title="Click to move to the other pile, drag to reorder"
      >
        <div className="w-20 h-12 rounded overflow-hidden shrink-0 bg-surface-800">
          <CoverImage url={entry.coverUrl} alt={entry.name} className="w-full h-full object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm text-slate-100 truncate">{entry.name}</div>
          <div className="flex items-center gap-2 mt-1">
            <Stars value={entry.starRating} />
            {entry.computedOverall != null && (
              <span className={`text-xs font-semibold ${scoreColor(entry.computedOverall)}`}>
                {entry.computedOverall.toFixed(1)}
              </span>
            )}
          </div>
        </div>
      </button>
    </div>
  );
}
