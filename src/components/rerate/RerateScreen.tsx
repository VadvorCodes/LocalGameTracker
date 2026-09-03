import type { Dispatch } from "react";
import type { CycleAction, CycleState } from "../../pages/RerateMode";
import RerateRatingPanel from "./RerateRatingPanel";

/** The re-rating phase: the queue built at review time, one game at a time. */
export default function RerateScreen({
  cycle,
  dispatch,
}: {
  cycle: CycleState;
  dispatch: Dispatch<CycleAction>;
}) {
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
