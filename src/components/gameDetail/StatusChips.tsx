import { STATUSES, STATUS_COLORS, STATUS_LABELS, type PlayStatus } from "../../types";

/** Play-status chip row; the active status is highlighted in its own colour. */
export default function StatusChips({
  status,
  onSelect,
}: {
  status: PlayStatus;
  onSelect: (status: PlayStatus) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Play status">
      {STATUSES.map((s) => {
        const c = STATUS_COLORS[s];
        return (
          <button
            key={s}
            aria-pressed={status === s}
            className={`chip py-1.5 px-3 ${
              status === s ? `${c.bg} ${c.text} ${c.border}` : "chip-idle"
            }`}
            onClick={() => onSelect(s)}
          >
            {STATUS_LABELS[s]}
          </button>
        );
      })}
    </div>
  );
}
