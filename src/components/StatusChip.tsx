import type { PlayStatus } from "../types";
import { STATUS_COLORS, STATUS_LABELS } from "../types";

/** Coloured play-status chip (label + tint); `className` appends overrides. */
export default function StatusChip({
  status,
  className = "",
}: {
  status: PlayStatus;
  className?: string;
}) {
  const c = STATUS_COLORS[status];
  return (
    <span className={`chip ${c.bg} ${c.text} ${c.border} ${className}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
