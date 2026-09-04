/**
 * Chip-style failure banner for failed loads (Library, Search, Dashboard).
 * Pass `onRetry` where retrying makes sense; omit it for reads with nothing
 * to re-trigger.
 */
export default function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="mb-4 chip bg-rose-500/10 text-rose-300 border-rose-500/30 py-1.5 flex items-center justify-between gap-3">
      <span>{message}</span>
      {onRetry && (
        <button
          className="chip bg-surface-800 text-slate-300 border-surface-600 hover:text-white"
          onClick={onRetry}
        >
          Retry
        </button>
      )}
    </div>
  );
}
