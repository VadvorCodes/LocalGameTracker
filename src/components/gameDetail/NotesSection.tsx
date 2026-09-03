/**
 * Private-notes textarea. The Save button only appears once the draft is
 * dirty; the page decides what saving means (and what fails).
 */
export default function NotesSection({
  notes,
  dirty,
  onChange,
  onSave,
}: {
  notes: string;
  dirty: boolean;
  onChange: (notes: string) => void;
  onSave: () => void;
}) {
  return (
    <section>
      <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Notes</h2>
      <textarea
        className="input w-full h-32 resize-none"
        placeholder="Private notes — what you loved, what dragged, where you stopped…"
        value={notes}
        onChange={(e) => onChange(e.target.value)}
      />
      {dirty && (
        <button className="btn-primary mt-2" onClick={onSave}>
          Save notes
        </button>
      )}
    </section>
  );
}
