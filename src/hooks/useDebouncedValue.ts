import { useEffect, useState } from "react";

/**
 * The value, delayed until it has stopped changing for `delayMs`. Rapid
 * changes restart the timer and only the last value comes through.
 * Distilled from the debounced queries in Library (200ms) and Search (350ms).
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);

  return debounced;
}
