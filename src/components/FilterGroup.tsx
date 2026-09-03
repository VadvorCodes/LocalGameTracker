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
            className={`chip ${selected.has(o) ? "bg-accent-600/20 text-accent-400 border-accent-500/40" : "bg-surface-800 text-slate-400 border-surface-600"}`}
            onClick={() => onToggle(o)}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}
