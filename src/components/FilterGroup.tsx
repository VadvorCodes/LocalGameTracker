/** A titled group of toggleable filter chips (used by Library and Search). */
export default function FilterGroup({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: string[];
  selected: Set<string>;
  onToggle: (v: string) => void;
}) {
  return (
    <div>
      <div className="text-xs font-semibold text-slate-400 mb-2">{title}</div>
      <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
        {options.map((o) => (
          <button
            key={o}
            aria-pressed={selected.has(o)}
            className={`chip ${selected.has(o) ? "chip-active" : "chip-idle"}`}
            onClick={() => onToggle(o)}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}
