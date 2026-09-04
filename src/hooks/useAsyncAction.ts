import { useCallback, useRef, useState } from "react";

/**
 * What a caught failure should read like in the UI: an Error's message without
 * the "Error: " prefix String() would add; anything else (Tauri IPC errors are
 * plain strings) verbatim.
 */
function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** The busy/error bookkeeping one async mutation needs. */
export interface AsyncAction {
  /** True while a wrapped call is in flight; drives disabled states and labels. */
  pending: boolean;
  /** The stringified error from the last failed run, or null. */
  error: string | null;
  /**
   * Run one async mutation. Ignored while a previous run is still in flight
   * (a ref-based guard, so it is closure-proof for handlers that outlive the
   * render that scheduled them). Resolves to the action's value on success
   * and to undefined both when guarded and when the action failed — the error
   * is captured into `error` instead of thrown.
   */
  run: <T>(action: () => Promise<T>) => Promise<T | undefined>;
  /** Clear the captured error. */
  reset: () => void;
}

/**
 * Wraps ad-hoc async mutations with the pending/error state pair that every
 * settings field otherwise declares by hand (`xBusy` + `xError`, set/cleared
 * around try/catch/finally).
 */
export function useAsyncAction(): AsyncAction {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  const run = useCallback(async <T>(action: () => Promise<T>): Promise<T | undefined> => {
    if (inFlightRef.current) return undefined;
    inFlightRef.current = true;
    setPending(true);
    setError(null);
    try {
      return await action();
    } catch (e) {
      setError(errorMessage(e));
      return undefined;
    } finally {
      inFlightRef.current = false;
      setPending(false);
    }
  }, []);

  const reset = useCallback(() => setError(null), []);

  return { pending, error, run, reset };
}
