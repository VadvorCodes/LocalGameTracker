import { useCallback, useRef } from "react";

/**
 * Sequence guard for racing async fetches: every begin() hands out a ticket
 * and invalidates all earlier ones, so a slow stale response can be recognised
 * (isCurrent === false) and discarded instead of clobbering newer state.
 * Distilled from the load guards in Library, Search and GameDetail.
 */
export function useSequentialFetch(): {
  /** Start a new operation and invalidate all previous ones; returns its ticket. */
  begin: () => number;
  /** Whether the operation holding this ticket is still the latest one. */
  isCurrent: (seq: number) => boolean;
} {
  const seqRef = useRef(0);
  const begin = useCallback(() => ++seqRef.current, []);
  const isCurrent = useCallback((seq: number) => seq === seqRef.current, []);
  return { begin, isCurrent };
}
