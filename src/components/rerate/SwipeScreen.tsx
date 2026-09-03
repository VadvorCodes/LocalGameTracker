import type { Dispatch } from "react";
import type { RerateDecision } from "../../types";
import type { CycleAction, CycleState } from "../../pages/RerateMode";
import SwipeBackdrop from "./SwipeBackdrop";
import SwipeCard from "./SwipeCard";
import MatchCard from "./MatchCard";
import DecisionButton from "./DecisionButton";

/**
 * The swipe phase: one card at a time over a progress strip of piles. Decisions
 * flow through the cycle reducer; the page owns the arrow-key listener, the
 * buttons here dispatch the same action.
 */
export default function SwipeScreen({
  cycle,
  dispatch,
}: {
  cycle: CycleState;
  dispatch: Dispatch<CycleAction>;
}) {
  const { pool, decisions } = cycle;
  const item = pool[cycle.swipeIdx];
  const decidedCount = Object.keys(decisions).length;
  const requestDecision = (d: RerateDecision) => dispatch({ type: "requestDecision", decision: d });

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
        <button className="btn-ghost !py-1.5 text-xs" onClick={() => dispatch({ type: "cancel" })}>
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

      {/* my-auto (not justify-center) so an overflowing small window can
          still scroll to every part of the card instead of clipping. */}
      <div className="relative flex-1 flex flex-col items-center px-6 min-h-0 overflow-y-auto">
        <div className="my-auto flex w-full flex-col items-center gap-5 py-6">
          <SwipeCard
            key={item.entry.id}
            item={item}
            exitRequest={cycle.exitRequest}
            onDecided={(d) => dispatch({ type: "cardDecided", decision: d })}
            onDragX={(x) => dispatch({ type: "dragXChanged", x })}
          />

          <p className="text-xs text-slate-500 text-center">
            Drag the card left to re-rate it, right to keep its rating — or use the arrow keys.
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
    </div>
  );
}
