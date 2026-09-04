import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { api } from "../api";
import type { LibraryEntry, PlayStatus, RerateDecision, ReratePoolItem } from "../types";
import type { DropTarget } from "../lib/dropTarget";
import { useSequentialFetch } from "../hooks/useSequentialFetch";
import IdleScreen from "../components/rerate/IdleScreen";
import LoadingScreen from "../components/rerate/LoadingScreen";
import SwipeScreen from "../components/rerate/SwipeScreen";
import ReviewScreen from "../components/rerate/ReviewScreen";
import RerateScreen from "../components/rerate/RerateScreen";
import DoneScreen from "../components/rerate/DoneScreen";

type Phase = "idle" | "loading" | "swipe" | "review" | "rerate" | "done";
export type Scope = "played" | "finished";

const SCOPE_KEY = "rerate_scope";

const SCOPE_STATUSES: Record<Scope, PlayStatus[]> = {
  played: ["Playing", "Completed", "Dropped"],
  finished: ["Completed", "Dropped"],
};

const EMPTY_POOL_MESSAGE = "No games are in scope right now — add some games to this scope first.";

/**
 * Everything one cycle tracks. `scope` and `scopeRows` stay outside: they are
 * idle-screen concerns that no cycle transition touches.
 */
export interface CycleState {
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
  dropTarget: (DropTarget & { pile: RerateDecision }) | null;
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
export type CycleAction =
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

  if (cycle.phase === "loading") return <LoadingScreen />;

  if (cycle.phase === "swipe") return <SwipeScreen cycle={cycle} dispatch={dispatch} />;

  if (cycle.phase === "review") {
    return (
      <ReviewScreen
        cycle={cycle}
        rerateItems={rerateItems}
        keepItems={keepItems}
        dispatch={dispatch}
      />
    );
  }

  if (cycle.phase === "rerate") return <RerateScreen cycle={cycle} dispatch={dispatch} />;

  if (cycle.phase === "done") return <DoneScreen cycle={cycle} dispatch={dispatch} />;

  return (
    <IdleScreen
      scope={scope}
      scopeRows={scopeRows}
      error={cycle.error}
      onChangeScope={changeScope}
      onStartCycle={startCycle}
    />
  );
}
