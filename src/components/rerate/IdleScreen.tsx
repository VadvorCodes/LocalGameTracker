import { CYCLE_SIZES } from "../../types";
import type { LibraryEntry, RerateCycleSize } from "../../types";
import type { Scope } from "../../pages/RerateMode";

const SCOPE_LABELS: Record<Scope, string> = {
  played: "All played games",
  finished: "Completed & dropped only",
};

/**
 * The idle/setup phase: scope picker, eligibility preview and the start
 * button. `scopeRows` come from the page's pre-cycle fetch; `error` carries a
 * failed or empty session back onto this screen.
 */
export default function IdleScreen({
  scope,
  scopeRows,
  error,
  onChangeScope,
  cycleSize,
  onChangeCycleSize,
  onStartCycle,
}: {
  scope: Scope;
  scopeRows: LibraryEntry[] | null;
  error: string | null;
  onChangeScope: (scope: Scope) => void;
  cycleSize: RerateCycleSize;
  onChangeCycleSize: (size: RerateCycleSize) => void;
  onStartCycle: () => void;
}) {
  const inScope = scopeRows?.length ?? 0;
  const cooling = scopeRows?.filter((r) => r.reratedAt).length ?? 0;
  const eligible = inScope - cooling;
  // The backend builds the pool from eligible games; a fully-cooled scope
  // revives from the whole scope instead, so mirror that in the preview.
  const poolBasis = eligible >= 2 ? eligible : inScope;
  // The pool is the chosen size capped by what's actually available.
  const cap = cycleSize === "full" ? poolBasis : cycleSize;
  const shownSize = Math.max(1, Math.min(cap, Math.max(poolBasis, 1)));
  return (
    <div className="p-8 max-w-2xl mx-auto h-full flex flex-col">
      <h1 className="text-xl font-semibold text-white">Re-Rate Mode</h1>
      <p className="text-sm text-slate-500 mt-2 leading-relaxed">
        Revisit old ratings with fresh eyes. A cycle shows you {shownSize} of your games one at a
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
                onClick={() => onChangeScope(s)}
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
                poolBasis >= 2
                  ? cycleSize === "full"
                    ? ` — one cycle of all ${poolBasis}`
                    : ` — cycles of ${cycleSize}`
                  : ""
              }.`
            : "Counting eligible games…"}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-500">Cycle size:</span>
          {CYCLE_SIZES.map((s) => (
            <button
              key={String(s)}
              aria-pressed={cycleSize === s}
              title={s === "full" ? "Every eligible game joins one cycle" : `${s} games per cycle`}
              className={`chip ${cycleSize === s ? "chip-active" : "chip-idle hover:text-slate-300"}`}
              onClick={() => onChangeCycleSize(s)}
            >
              {s === "full" ? "Full library" : s}
            </button>
          ))}
        </div>
        <button
          className="btn bg-surface-800 hover:bg-accent-600 text-slate-300 hover:text-white"
          disabled={inScope < 2}
          onClick={onStartCycle}
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
        {error && <p className="text-xs text-rose-400">{error}</p>}
      </div>
    </div>
  );
}
