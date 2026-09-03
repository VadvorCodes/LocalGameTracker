import { Link } from "react-router-dom";
import type { Dispatch } from "react";
import type { CycleAction, CycleState } from "../../pages/RerateMode";

/** The done phase: the cycle's summary and the ways out of it. */
export default function DoneScreen({
  cycle,
  dispatch,
}: {
  cycle: CycleState;
  dispatch: Dispatch<CycleAction>;
}) {
  const kept = cycle.pool.length - cycle.summary.rerated - cycle.summary.skipped;
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
