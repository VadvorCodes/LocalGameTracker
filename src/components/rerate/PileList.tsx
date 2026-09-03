import type { ReratePoolItem } from "../../types";
import { dropTargetAt, type DropTarget } from "../../lib/dropTarget";
import PileRow from "./PileRow";

/**
 * One review pile: heading plus a wrapping grid of rows (or a drop placeholder
 * when empty). A drop ring marks the pile while a drag is aimed at it; the
 * insertion line position comes from `dropTargetAt` on the rendered rows.
 */
export default function PileList({
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
  function dropTargetFor(e: React.DragEvent): DropTarget {
    const rects = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("[data-pile-row]")).map(
      (row) => row.getBoundingClientRect(),
    );
    return dropTargetAt(rects, e.clientX, e.clientY);
  }

  return (
    <section
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const { index, edge } = dropTargetFor(e);
        onDragOver(index, edge);
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDropItem(Number(e.dataTransfer.getData("text/plain")), dropTargetFor(e).index);
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
              dropBefore={
                dropIndex != null && dropEdge != null && items[dropIndex]?.entry.id === entry.id
              }
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
