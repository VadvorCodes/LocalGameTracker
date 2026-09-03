import { useEffect, useRef, useState } from "react";
import {
  deriveBreakpoints,
  setDivider,
  type RankWeights,
  type WeightKey,
} from "../lib/searchRank";

const SEGMENTS: { key: WeightKey; label: string; bar: string; dot: string }[] = [
  // Fixed colours, deliberately NOT the theme accent: the accent can be any
  // colour the user picks (e.g. green) and must not blend into neighbours.
  { key: "text", label: "Name match", bar: "bg-violet-500/60", dot: "bg-violet-400" },
  { key: "popularity", label: "Popularity", bar: "bg-emerald-500/60", dot: "bg-emerald-400" },
  { key: "recency", label: "Recency", bar: "bg-sky-500/60", dot: "bg-sky-400" },
];

/**
 * Allocation bar for the ranking weights: one full bar split into three
 * coloured segments whose widths are the weights. The two dividers between
 * segments are the only interactive parts — dragging one shifts weight
 * between its two neighbours, and the bar can never stop being full.
 */
export default function MixBar({
  weights,
  onChange,
}: {
  weights: RankWeights;
  onChange: (next: RankWeights) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  // State (not a ref) so the dragged handle can stay visually highlighted.
  const [dragging, setDragging] = useState<0 | 1 | null>(null);

  const { b1, b2 } = deriveBreakpoints(weights);
  const cuts = [b1, b2];
  const widths = [b1, b2 - b1, 100 - b2];

  // Re-registered every render so the handlers always see the latest weights.
  useEffect(() => {
    function onPointerMove(e: PointerEvent) {
      if (dragging === null) return;
      const rect = barRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return;
      onChange(setDivider(weights, dragging, ((e.clientX - rect.left) / rect.width) * 100));
    }
    function onPointerUp() {
      setDragging(null);
    }
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  });

  function onKeyDown(divider: 0 | 1) {
    return (e: React.KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        onChange(
          setDivider(weights, divider, cuts[divider] + (e.key === "ArrowRight" ? 1 : -1)),
        );
      } else if (e.key === "Home" || e.key === "End") {
        e.preventDefault();
        onChange(setDivider(weights, divider, e.key === "Home" ? 0 : 100));
      }
    };
  }

  return (
    <div>
      <div ref={barRef} data-testid="mix-bar" className="relative h-9">
        <div className="absolute inset-0 flex overflow-hidden rounded-lg">
          {SEGMENTS.map((s, i) => (
            <div
              key={s.key}
              className={`${s.bar} flex items-center justify-center overflow-hidden px-1`}
              style={{ width: `${widths[i]}%` }}
            >
              <span className="whitespace-nowrap text-[11px] font-medium text-white">
                {widths[i] >= 12 ? `${s.label} ` : ""}
                {widths[i]}%
              </span>
            </div>
          ))}
        </div>
        {cuts.map((c, i) => (
          <div
            key={i}
            role="slider"
            aria-label={`Between ${SEGMENTS[i].label} and ${SEGMENTS[i + 1].label}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={c}
            tabIndex={0}
            className="group/handle absolute top-0 bottom-0 z-10 w-6 -translate-x-1/2 cursor-col-resize outline-none"
            style={{ left: `${c}%` }}
            onPointerDown={(e) => {
              setDragging(i as 0 | 1);
              e.preventDefault();
            }}
            onKeyDown={onKeyDown(i as 0 | 1)}
          >
            <div className="absolute left-1/2 top-0 h-full w-0.5 -translate-x-1/2 bg-surface-950/50" />
            {/* Grip knob: the visible "grab me" handle on each divider. */}
            <div
              className={`absolute left-1/2 top-1/2 flex h-7 w-3.5 -translate-x-1/2 -translate-y-1/2 items-center justify-center gap-[2px] rounded-full border shadow-md transition-all ${
                dragging === i
                  ? "scale-110 border-accent-400 bg-white"
                  : "border-surface-500 bg-surface-200 group-hover/handle:scale-110 group-hover/handle:border-accent-400 group-hover/handle:bg-white"
              }`}
            >
              <span className="h-3 w-px rounded bg-surface-500" />
              <span className="h-3 w-px rounded bg-surface-500" />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
        {SEGMENTS.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${s.dot}`} />
            {s.label} <span className="text-slate-200">{Math.round(weights[s.key] * 100)}%</span>
          </span>
        ))}
        <span className="text-slate-500">Drag the dividers to adjust the mix</span>
      </div>
    </div>
  );
}
