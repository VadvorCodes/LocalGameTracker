import { describe, expect, it } from "vitest";
import { dropTargetAt, type RowRect } from "./dropTarget";

/** A 200x60 row placed at (left, top). */
function rect(top: number, left = 0, width = 200, height = 60): RowRect {
  return { left, top, right: left + width, bottom: top + height, width, height };
}

describe("dropTargetAt", () => {
  it("appends to an empty pile", () => {
    expect(dropTargetAt([], 50, 30)).toEqual({ index: 0, edge: null });
  });

  it("splits a single row at its horizontal centre", () => {
    const rows = [rect(0)];
    expect(dropTargetAt(rows, 99, 30)).toEqual({ index: 0, edge: "top" });
    // the exact midpoint still counts as "before"
    expect(dropTargetAt(rows, 100, 30)).toEqual({ index: 0, edge: "top" });
    // right half of the only row → append after it
    expect(dropTargetAt(rows, 101, 30)).toEqual({ index: 1, edge: null });
  });

  it("inserts at the top when the pointer is above every row", () => {
    expect(dropTargetAt([rect(70), rect(140)], 100, 10)).toEqual({ index: 0, edge: "top" });
  });

  it("appends when the pointer is below every row", () => {
    expect(dropTargetAt([rect(0), rect(70)], 100, 500)).toEqual({ index: 2, edge: null });
  });

  it("uses vertical midpoints between stacked rows", () => {
    const rows = [rect(0), rect(70), rect(140)];
    // in the gap between rows 0 and 1 → before row 1
    expect(dropTargetAt(rows, 100, 65)).toEqual({ index: 1, edge: "top" });
    // lower half of row 1 (past its midpoint) → before row 2
    expect(dropTargetAt(rows, 150, 80)).toEqual({ index: 2, edge: "top" });
  });

  it("draws a left edge only when the target wraps to the same visual row", () => {
    // two columns side by side share a top
    expect(dropTargetAt([rect(0, 0), rect(0, 210)], 150, 30)).toEqual({ index: 1, edge: "left" });
    // the same geometry stacked draws a top edge instead
    expect(dropTargetAt([rect(0), rect(70)], 150, 30)).toEqual({ index: 1, edge: "top" });
  });

  it("treats near-identical tops as one visual row", () => {
    expect(dropTargetAt([rect(0), rect(2)], 150, 30)).toEqual({ index: 1, edge: "left" });
    expect(dropTargetAt([rect(0), rect(6)], 150, 30)).toEqual({ index: 1, edge: "top" });
  });
});
