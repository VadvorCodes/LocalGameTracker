import { useEffect, useRef, useState } from "react";
import type { LibraryEntry, RerateDecision, ReratePoolItem } from "../../types";
import { STATUS_COLORS, STATUS_LABELS } from "../../types";
import CoverImage from "../CoverImage";
import { Stars } from "../StarRating";
import { formatPlaytime, scoreColor } from "../../lib/format";

const COMMIT_THRESHOLD = 110; // px of drag past which a swipe commits
const FLY_OUT_X = 700; // px the card travels once a decision is made

/**
 * The centrepiece card of the swipe phase. Drag left = "re-rate", right =
 * "keep rating". Also commits programmatically when the parent sends an
 * `exitRequest` (on-screen buttons / arrow keys).
 */
export default function SwipeCard({
  item,
  exitRequest,
  onDecided,
  onDragX,
}: {
  item: ReratePoolItem;
  exitRequest: RerateDecision | null;
  onDecided: (d: RerateDecision) => void;
  onDragX?: (x: number) => void;
}) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [flying, setFlying] = useState<RerateDecision | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const decidedRef = useRef(false);

  const entry: LibraryEntry = item.entry;

  useEffect(() => {
    if (exitRequest && !flying) fly(exitRequest);
  }, [exitRequest]);

  function fly(d: RerateDecision) {
    setFlying(d);
    setDragging(false);
    onDragX?.(d === "keep" ? FLY_OUT_X : -FLY_OUT_X);
  }

  function endDrag() {
    if (!dragging) return;
    setDragging(false);
    startRef.current = null;
    if (dx <= -COMMIT_THRESHOLD) fly("rerate");
    else if (dx >= COMMIT_THRESHOLD) fly("keep");
    else {
      setDx(0);
      onDragX?.(0);
    }
  }

  function onTransitionEnd(e: React.TransitionEvent) {
    // Only react to the card's own transform transition finishing a fly-out.
    if (flying && !decidedRef.current && e.propertyName === "transform") {
      decidedRef.current = true;
      onDecided(flying);
    }
  }

  const transform = flying
    ? `translateX(${flying === "keep" ? FLY_OUT_X : -FLY_OUT_X}px) rotate(${flying === "keep" ? 16 : -16}deg)`
    : `translateX(${dx}px) rotate(${dx / 24}deg)`;

  return (
    <div
      className="card w-[380px] max-w-full overflow-hidden select-none cursor-grab active:cursor-grabbing shadow-2xl shadow-black/50"
      data-testid="swipe-card"
      style={{
        transform,
        transition: dragging ? "none" : "transform 280ms cubic-bezier(0.2, 0.8, 0.3, 1)",
        touchAction: "none",
        opacity: flying ? 0.15 : 1,
      }}
      onTransitionEnd={onTransitionEnd}
      onPointerDown={(e) => {
        if (flying) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        startRef.current = { x: e.clientX, y: e.clientY };
        setDragging(true);
      }}
      onPointerMove={(e) => {
        if (!dragging || !startRef.current) return;
        const next = e.clientX - startRef.current.x;
        setDx(next);
        onDragX?.(next);
      }}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {/* The cover yields height (max-h) on short windows so the name and
          ratings below it stay visible — text outranks the portrait here. */}
      <div className="relative aspect-[16/9] max-h-[24vh] overflow-hidden">
        <CoverImage
          url={entry.coverUrl}
          alt={entry.name}
          className="w-full h-full object-cover pointer-events-none"
        />
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-surface-900 to-transparent" />
      </div>
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-white leading-tight">{entry.name}</h2>
          <span
            className={`chip shrink-0 ${STATUS_COLORS[entry.status].bg} ${STATUS_COLORS[entry.status].text} ${STATUS_COLORS[entry.status].border}`}
          >
            {STATUS_LABELS[entry.status]}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Stars value={entry.starRating} />
          {entry.computedOverall != null ? (
            <span className="flex items-center gap-2">
              <span className="text-[11px] uppercase tracking-wide text-slate-500">Detailed</span>
              <span className={`text-sm font-semibold ${scoreColor(entry.computedOverall)}`}>
                {entry.computedOverall.toFixed(1)}/100
              </span>
            </span>
          ) : (
            <span className="text-xs text-slate-600">no detailed score</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          <span>{formatPlaytime(entry.playtimeMinutes)}</span>
          {entry.genres.length > 0 && (
            <span className="truncate">{entry.genres.slice(0, 4).join(" · ")}</span>
          )}
        </div>
      </div>
    </div>
  );
}
