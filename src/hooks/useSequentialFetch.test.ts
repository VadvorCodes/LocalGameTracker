import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useSequentialFetch } from "./useSequentialFetch";

describe("useSequentialFetch", () => {
  it("hands out increasing tickets starting at 1", () => {
    const { result } = renderHook(() => useSequentialFetch());
    expect(result.current.begin()).toBe(1);
    expect(result.current.begin()).toBe(2);
  });

  it("marks the latest ticket current and earlier ones stale", () => {
    const { result } = renderHook(() => useSequentialFetch());
    const first = result.current.begin();
    expect(result.current.isCurrent(first)).toBe(true);

    const second = result.current.begin();
    expect(result.current.isCurrent(second)).toBe(true);
    expect(result.current.isCurrent(first)).toBe(false);
  });

  it("keeps the counter across re-renders", () => {
    const { result, rerender } = renderHook(() => useSequentialFetch());
    const first = result.current.begin();
    rerender();
    const second = result.current.begin();
    expect(second).toBe(first + 1);
    expect(result.current.isCurrent(first)).toBe(false);
  });

  it("tickets stay current until a newer one is issued (act-wrapped awaits)", () => {
    const { result } = renderHook(() => useSequentialFetch());
    let ticket = 0;
    act(() => {
      ticket = result.current.begin();
    });
    expect(result.current.isCurrent(ticket)).toBe(true);
  });
});
