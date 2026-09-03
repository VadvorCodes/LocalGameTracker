/** Minimal rectangle shape the hit-test needs (DOMRect-compatible). */
export interface RowRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

/** Where a drop would land: the pile index plus which side draws the line. */
export interface DropTarget {
  index: number;
  edge: "top" | "left" | null;
}

/** Rows whose tops differ by less than this count as one visual row (grid wrap). */
const SAME_ROW_TOLERANCE_PX = 4;

/**
 * Pile drop hit-test. An item under the pointer splits at its centre: left
 * half = before it, right half = after it. Between rows, the vertical
 * midpoints decide. `edge` picks which side of the target the insertion line
 * draws on (null = appending; the pile ring alone marks the spot).
 */
export function dropTargetAt(rects: RowRect[], x: number, y: number): DropTarget {
  const sameRow = (a: number, b: number) =>
    Math.abs(rects[a].top - rects[b].top) < SAME_ROW_TOLERANCE_PX;

  // The row (if any) whose bounds contain the pointer.
  let over = -1;
  for (let k = 0; k < rects.length; k++) {
    const r = rects[k];
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
      over = k;
      break;
    }
  }

  if (over >= 0) {
    if (x <= rects[over].left + rects[over].width / 2) {
      return { index: over, edge: over > 0 && sameRow(over - 1, over) ? "left" : "top" };
    }
    const after = over + 1;
    if (after >= rects.length) return { index: after, edge: null };
    return { index: after, edge: sameRow(over, after) ? "left" : "top" };
  }

  // Pointer between rows: first row whose vertical midpoint is below it.
  let i = rects.length;
  for (let k = 0; k < rects.length; k++) {
    if (y < rects[k].top + rects[k].height / 2) {
      i = k;
      break;
    }
  }
  if (i >= rects.length) return { index: i, edge: null };
  return { index: i, edge: i > 0 && sameRow(i - 1, i) ? "left" : "top" };
}
