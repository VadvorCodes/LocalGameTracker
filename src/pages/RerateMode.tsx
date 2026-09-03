import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import type { LibraryEntry, PlayStatus, RerateDecision, ReratePoolItem } from "../types";
import { useSequentialFetch } from "../hooks/useSequentialFetch";
import SwipeCard from "../components/rerate/SwipeCard";
import MatchCard from "../components/rerate/MatchCard";
import RerateRatingPanel from "../components/rerate/RerateRatingPanel";
import SwipeBackdrop from "../components/rerate/SwipeBackdrop";
import DecisionButton from "../components/rerate/DecisionButton";
import PileList from "../components/rerate/PileList";

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

const EMPTY_POOL_MESSAGE = "No games are in scope right now — add some games to this scope first.";

/**
 * Everything one cycle tracks. `scope` and `scopeRows` stay outside: they are
 * idle-screen concerns that no cycle transition touches.
 */
interface CycleState {
  phase: Phase;
  pool: ReratePoolItem[];
  // Pile order as entry ids: piles render in this sequence and the re-rate
  // queue keeps it, so dragging rows around changes the re-rating order.
  order: number[];
  decisions: Record<number, RerateDecision>;
  swipeIdx: number;
  dragX: number;
  exitRequest: RerateDecision | null;
  rerateQueue: ReratePoolItem[];
  rerateIdx: number;
  summary: { rerated: number; skipped: number };
  error: string | null;
  // True after "Back to swiping" — the pile is then re-swiped fresh while the
  // squares (buttons + progress bar) show what was chosen last time.
  revisiting: boolean;
  // Snapshot of the decisions made before the current (re)pass started.
  previousDecisions: Record<number, RerateDecision>;
  dragId: number | null;
  dropTarget: { pile: RerateDecision; index: number; edge: "top" | "left" | null } | null;
}

/**
 * The canonical reset: every exit from a cycle ("Cancel cycle", failed or
 * empty session, "Start another cycle") returns to exactly this object, so
 * there is one place — not one per exit path — that knows what a clean slate
 * looks like.
 */
const initialState: CycleState = {
  phase: "idle",
  pool: [],
  order: [],
  decisions: {},
  swipeIdx: 0,
  dragX: 0,
  exitRequest: null,
  rerateQueue: [],
  rerateIdx: 0,
  summary: { rerated: 0, skipped: 0 },
  error: null,
  revisiting: false,
  previousDecisions: {},
  dragId: null,
  dropTarget: null,
};

/** The cycle's transitions, named after the user actions that trigger them. */
type CycleAction =
  | { type: "startSession" }
  | { type: "poolLoaded"; pool: ReratePoolItem[] }
  | { type: "sessionFailed"; message: string }
  | { type: "requestDecision"; decision: RerateDecision }
  | { type: "cardDecided"; decision: RerateDecision }
  | { type: "dragXChanged"; x: number }
  | { type: "backToSwiping" }
  | { type: "cancel" }
  | { type: "togglePile"; entryId: number; pile: RerateDecision }
  | { type: "dragStarted"; entryId: number }
  | { type: "dropTargetChanged"; pile: RerateDecision; index: number; edge: "top" | "left" | null }
  | { type: "dragEnded" }
  | { type: "reorder"; entryId: number; pile: RerateDecision; index: number }
  | { type: "confirmReview" }
  | { type: "gameFinished"; saved: boolean };

/** Pile contents in display order. Ids without a pool item (an order entry
 * outliving its pool row) are skipped rather than crashing the render. */
function pileItems(
  pool: ReratePoolItem[],
  order: number[],
  decisions: Record<number, RerateDecision>,
  decision: RerateDecision,
): ReratePoolItem[] {
  const byId = new Map(pool.map((i) => [i.entry.id, i]));
  return order.flatMap((id) => {
    const item = byId.get(id);
    return decisions[id] === decision && item ? [item] : [];
  });
}

function cycleReducer(state: CycleState, action: CycleAction): CycleState {
  switch (action.type) {
    case "startSession":
      return { ...state, phase: "loading", error: null };

    case "poolLoaded":
      // An empty pool bounces straight back to the idle screen with the reason.
      if (action.pool.length === 0) return { ...initialState, error: EMPTY_POOL_MESSAGE };
      return {
        ...initialState,
        phase: "swipe",
        pool: action.pool,
        order: action.pool.map((i) => i.entry.id),
      };

    case "sessionFailed":
      return { ...initialState, error: action.message };

    case "requestDecision":
      if (state.exitRequest) return state; // a card is already flying out
      return { ...state, exitRequest: action.decision };

    case "dragXChanged":
      return { ...state, dragX: action.x };

    case "cardDecided": {
      const item = state.pool[state.swipeIdx];
      const decisions = item
        ? { ...state.decisions, [item.entry.id]: action.decision }
        : state.decisions;
      const last = state.swipeIdx + 1 >= state.pool.length;
      return {
        ...state,
        decisions,
        exitRequest: null,
        dragX: 0,
        swipeIdx: last ? state.swipeIdx : state.swipeIdx + 1,
        phase: last ? "review" : state.phase,
      };
    }

    case "backToSwiping":
      // Squares keep showing what was chosen; the pile itself is re-swiped
      // from scratch (rectangles start gray again).
      return {
        ...state,
        previousDecisions: state.decisions,
        decisions: {},
        swipeIdx: 0,
        exitRequest: null,
        dragX: 0,
        revisiting: true,
        phase: "swipe",
      };

    case "cancel":
      return { ...initialState };

    case "togglePile":
      // Click keeps the row's global order slot — only its decision flips.
      return { ...state, decisions: { ...state.decisions, [action.entryId]: action.pile } };

    case "dragStarted":
      return { ...state, dragId: action.entryId };

    case "dropTargetChanged": {
      const prev = state.dropTarget;
      if (
        prev &&
        prev.pile === action.pile &&
        prev.index === action.index &&
        prev.edge === action.edge
      ) {
        return state;
      }
      return {
        ...state,
        dropTarget: { pile: action.pile, index: action.index, edge: action.edge },
      };
    }

    case "dragEnded":
      return { ...state, dragId: null, dropTarget: null };

    case "reorder": {
      // A drop ends the drag; ids not in the pool (stale dataTransfer) are ignored.
      if (!state.pool.some((i) => i.entry.id === action.entryId)) return state;
      const { decisions, order } = state;
      // The game joins `pile` (its decision flips) at `index`; everything else
      // keeps its relative order.
      const pileIds = order.filter(
        (oid) => oid !== action.entryId && decisions[oid] === action.pile,
      );
      const resequenced = [
        ...pileIds.slice(0, action.index),
        action.entryId,
        ...pileIds.slice(action.index),
      ];
      const rest = order.filter((oid) => oid !== action.entryId && decisions[oid] !== action.pile);
      return {
        ...state,
        decisions: { ...decisions, [action.entryId]: action.pile },
        order: [...rest, ...resequenced],
        dragId: null,
        dropTarget: null,
      };
    }

    case "confirmReview": {
      const queue = pileItems(state.pool, state.order, state.decisions, "rerate");
      return {
        ...state,
        rerateQueue: queue,
        rerateIdx: 0,
        phase: queue.length > 0 ? "rerate" : "done",
      };
    }

    case "gameFinished": {
      const summary = {
        rerated: state.summary.rerated + (action.saved ? 1 : 0),
        skipped: state.summary.skipped + (action.saved ? 0 : 1),
      };
      const last = state.rerateIdx + 1 >= state.rerateQueue.length;
      return {
        ...state,
        summary,
        rerateIdx: last ? state.rerateIdx : state.rerateIdx + 1,
        phase: last ? "done" : state.phase,
      };
    }
  }
}

export default function RerateMode() {
  const [cycle, dispatch] = useReducer(cycleReducer, initialState);
  const [scope, setScope] = useState<Scope>(
    // validate the persisted value — a corrupted entry must fall back, not
    // flow undefined statuses into the backend queries
    () => (localStorage.getItem(SCOPE_KEY) === "finished" ? "finished" : "played"),
  );
  const [scopeRows, setScopeRows] = useState<LibraryEntry[] | null>(null);
  const { begin, isCurrent } = useSequentialFetch();

  // Setup-screen counts, from the same rule the backend applies to build the
  // pool: in scope and not tagged "Recently Rerated". Rows include the tag, so
  // eligible/cooling are exact rather than an upper bound.
  useEffect(() => {
    if (cycle.phase !== "idle") return;
    const seq = begin();
    api
      .libraryQuery({ statuses: SCOPE_STATUSES[scope], sort: "name" })
      .then((rows) => isCurrent(seq) && setScopeRows(rows))
      .catch(() => isCurrent(seq) && setScopeRows(null));
  }, [cycle.phase, scope, begin, isCurrent]);

  function changeScope(s: Scope) {
    setScope(s);
    localStorage.setItem(SCOPE_KEY, s);
  }

  async function startCycle() {
    dispatch({ type: "startSession" });
    try {
      const items = await api.startRerateSession(SCOPE_STATUSES[scope]);
      dispatch({ type: "poolLoaded", pool: items });
    } catch (e) {
      dispatch({ type: "sessionFailed", message: String(e) });
    }
  }

  const requestDecision = useCallback(
    (d: RerateDecision) => dispatch({ type: "requestDecision", decision: d }),
    [dispatch],
  );

  // Arrow keys mirror the swipe gestures.
  useEffect(() => {
    if (cycle.phase !== "swipe") return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") requestDecision("rerate");
      if (e.key === "ArrowRight") requestDecision("keep");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cycle.phase, requestDecision]);

  // Pile derivation, memoised so drag-tracking re-renders don't rebuild it.
  const { pool, order, decisions } = cycle;
  const rerateItems = useMemo(
    () => pileItems(pool, order, decisions, "rerate"),
    [pool, order, decisions],
  );
  const keepItems = useMemo(
    () => pileItems(pool, order, decisions, "keep"),
    [pool, order, decisions],
  );

  if (cycle.phase === "loading") {
    return (
      <div className="h-full flex items-center justify-center text-slate-500">
        Shuffling your library…
      </div>
    );
  }

  if (cycle.phase === "swipe") {
    const item = pool[cycle.swipeIdx];
    const decidedCount = Object.keys(decisions).length;
    return (
      <div className="h-full flex flex-col relative overflow-hidden">
        <SwipeBackdrop dragX={cycle.dragX} />
        <div className="relative p-6 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-white">Re-Rate Mode</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Game {cycle.swipeIdx + 1} of {pool.length} · {decidedCount} categorised
            </p>
          </div>
          <button
            className="btn-ghost !py-1.5 text-xs"
            onClick={() => dispatch({ type: "cancel" })}
          >
            Cancel cycle
          </button>
        </div>
        <div className="relative px-6 flex gap-1">
          {pool.map((i) => {
            const d = decisions[i.entry.id];
            const prev = cycle.previousDecisions[i.entry.id];
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
                    cycle.revisiting && prev
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
            exitRequest={cycle.exitRequest}
            onDecided={(d) => dispatch({ type: "cardDecided", decision: d })}
            onDragX={(x) => dispatch({ type: "dragXChanged", x })}
          />

          <p className="text-xs text-slate-500 text-center">
            Drag the card left to re-rate it, right to keep its rating — or use the buttons / arrow
            keys.
          </p>

          <div
            className="flex gap-8 items-start transition-opacity duration-150"
            style={{ opacity: cycle.dragX !== 0 ? 0 : 1 }}
          >
            <DecisionButton
              kind="rerate"
              label="✕ Re-rate"
              previous={cycle.previousDecisions[item.entry.id]}
              showIndicator={cycle.revisiting}
              onClick={() => requestDecision("rerate")}
            />
            <DecisionButton
              kind="keep"
              label="✓ Keep rating"
              previous={cycle.previousDecisions[item.entry.id]}
              showIndicator={cycle.revisiting}
              onClick={() => requestDecision("keep")}
            />
          </div>

          <div
            className="transition-opacity duration-150"
            style={{ opacity: cycle.dragX !== 0 ? 0 : 1 }}
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

  if (cycle.phase === "review") {
    return (
      <div className="p-8 max-w-4xl mx-auto space-y-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-white">Cycle review</h1>
            <p className="text-sm text-slate-500 mt-1">
              Click a game to move it between piles, or drag it — dragging within a pile reorders
              it, which is the order the re-rating follows.
            </p>
          </div>
          <button className="btn-ghost" onClick={() => dispatch({ type: "backToSwiping" })}>
            ← Back to swiping
          </button>
        </header>

        <PileList
          title={`Re-rate — ${rerateItems.length}`}
          tone="rose"
          items={rerateItems}
          draggedId={cycle.dragId}
          dropIndex={cycle.dropTarget?.pile === "rerate" ? cycle.dropTarget.index : null}
          dropEdge={cycle.dropTarget?.pile === "rerate" ? cycle.dropTarget.edge : null}
          onToggle={(id) => dispatch({ type: "togglePile", entryId: id, pile: "keep" })}
          onDragOver={(index, edge) =>
            dispatch({ type: "dropTargetChanged", pile: "rerate", index, edge })
          }
          onDropItem={(id, index) =>
            dispatch({ type: "reorder", entryId: id, pile: "rerate", index })
          }
          onDragStart={(id) => dispatch({ type: "dragStarted", entryId: id })}
          onDragEnd={() => dispatch({ type: "dragEnded" })}
        />
        <PileList
          title={`Keep rating — ${keepItems.length}`}
          tone="emerald"
          items={keepItems}
          draggedId={cycle.dragId}
          dropIndex={cycle.dropTarget?.pile === "keep" ? cycle.dropTarget.index : null}
          dropEdge={cycle.dropTarget?.pile === "keep" ? cycle.dropTarget.edge : null}
          onToggle={(id) => dispatch({ type: "togglePile", entryId: id, pile: "rerate" })}
          onDragOver={(index, edge) =>
            dispatch({ type: "dropTargetChanged", pile: "keep", index, edge })
          }
          onDropItem={(id, index) =>
            dispatch({ type: "reorder", entryId: id, pile: "keep", index })
          }
          onDragStart={(id) => dispatch({ type: "dragStarted", entryId: id })}
          onDragEnd={() => dispatch({ type: "dragEnded" })}
        />

        <div className="flex justify-end">
          <button className="btn-primary" onClick={() => dispatch({ type: "confirmReview" })}>
            {rerateItems.length > 0 ? "Confirm & start re-rating" : "Confirm & finish"}
          </button>
        </div>
      </div>
    );
  }

  if (cycle.phase === "rerate") {
    const item = cycle.rerateQueue[cycle.rerateIdx];
    return (
      <div className="p-4 sm:p-8 max-w-4xl mx-auto h-full flex flex-col">
        <header className="mb-6">
          <h1 className="text-xl font-semibold text-white">Re-rating</h1>
          <p className="text-sm text-slate-500 mt-1">
            Game {cycle.rerateIdx + 1} of {cycle.rerateQueue.length} — update the scores that no
            longer feel right. Skipped games keep their rating and stay eligible for future cycles.
          </p>
        </header>
        <div className="flex-1 flex items-start justify-center">
          <RerateRatingPanel
            key={item.entry.id}
            entry={item.entry}
            onSaved={() => dispatch({ type: "gameFinished", saved: true })}
            onSkipped={() => dispatch({ type: "gameFinished", saved: false })}
          />
        </div>
      </div>
    );
  }

  if (cycle.phase === "done") {
    const kept = pool.length - cycle.summary.rerated - cycle.summary.skipped;
    return (
      <div className="p-8 max-w-xl mx-auto h-full flex flex-col items-center justify-center text-center space-y-6">
        <div className="text-5xl">🎉</div>
        <div>
          <h1 className="text-xl font-semibold text-white">Cycle complete</h1>
          <p className="text-sm text-slate-500 mt-2">
            {cycle.summary.rerated} re-rated · {cycle.summary.skipped} skipped · {kept} kept their
            rating. Re-rated games sit out the next cycle, then become eligible again.
          </p>
        </div>
        <div className="flex gap-3">
          <Link to="/library" className="btn-primary">
            Back to Library
          </Link>
          <button className="btn-ghost" onClick={() => dispatch({ type: "cancel" })}>
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
        Revisit old ratings with fresh eyes. A cycle shows you {cycleSize} of your games one at a
        time — swipe left on the ones whose rating no longer feels right, right on the ones you
        stand by. Afterwards you re-rate the left pile individually. Games you re-rate sit out the
        next cycle.
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
            Everything in scope is cooling down — starting now resets the cooldown and puts all{" "}
            {inScope} games back in the pool.
          </p>
        )}
        {cycle.error && <p className="text-xs text-rose-400">{cycle.error}</p>}
      </div>
    </div>
  );
}
