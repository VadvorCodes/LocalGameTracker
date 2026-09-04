import type { RerateDecision } from "../../types";

/**
 * The small square that remembers a decision: red for re-rate, green for
 * keep, invisible while unmarked. Used under the decision buttons and in the
 * progress strip.
 */
export function DecisionSquare({
  tone,
  marked,
  title,
}: {
  tone: RerateDecision;
  marked: boolean;
  title?: string;
}) {
  return (
    <div
      className={`h-2.5 w-2.5 rounded-sm transition-colors ${
        marked ? (tone === "rerate" ? "bg-rose-500" : "bg-emerald-500") : "bg-transparent"
      }`}
      title={title}
    />
  );
}

/**
 * Swipe-phase decision button. When revisiting (after "Back to swiping") a
 * small square appears under the side chosen last time, as a reminder — the
 * pass itself is fresh, so both buttons stay active.
 */
export default function DecisionButton({
  kind,
  label,
  previous,
  showIndicator,
  onClick,
}: {
  kind: RerateDecision;
  label: string;
  previous: RerateDecision | undefined;
  showIndicator: boolean;
  onClick: () => void;
}) {
  const isRerate = kind === "rerate";
  const marked = showIndicator && previous === kind;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        className={isRerate ? "btn-danger" : "btn bg-emerald-600 hover:bg-emerald-500 text-white"}
        onClick={onClick}
      >
        {label}
      </button>
      <DecisionSquare tone={kind} marked={marked} title={marked ? "Chosen last time" : undefined} />
    </div>
  );
}
