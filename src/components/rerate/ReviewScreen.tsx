import type { Dispatch } from "react";
import type { ReratePoolItem } from "../../types";
import type { CycleAction, CycleState } from "../../pages/RerateMode";
import PileList from "./PileList";

/**
 * The review phase: the cycle's piles, click- or drag-sortable. The piles are
 * derived in the page (memoised so drag-tracking re-renders stay cheap) and
 * handed in already built.
 */
export default function ReviewScreen({
  cycle,
  rerateItems,
  keepItems,
  dispatch,
}: {
  cycle: CycleState;
  rerateItems: ReratePoolItem[];
  keepItems: ReratePoolItem[];
  dispatch: Dispatch<CycleAction>;
}) {
  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Cycle review</h1>
          <p className="text-sm text-slate-500 mt-1">
            Click a game to move it between piles, or drag it — dragging within a pile reorders it,
            which is the order the re-rating follows.
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
        onDropItem={(id, index) => dispatch({ type: "reorder", entryId: id, pile: "keep", index })}
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
