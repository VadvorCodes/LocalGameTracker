import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import MixBar from "./MixBar";
import { RANK_PRESETS } from "../lib/searchRank";

const onChange = vi.fn();

const DIVIDER_0 = "Between Name match and Popularity";
const DIVIDER_1 = "Between Popularity and Recency";

function rect(left: number, width: number): DOMRect {
  return {
    left,
    width,
    top: 0,
    height: 36,
    right: left + width,
    bottom: 36,
    x: left,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;
}

function renderBar(weights = RANK_PRESETS.balanced) {
  return render(<MixBar weights={weights} onChange={onChange} />);
}

beforeEach(() => {
  onChange.mockClear();
});

describe("MixBar", () => {
  it("renders the three segments and the legend readouts", () => {
    renderBar();
    expect(screen.getByText("Name match")).toBeInTheDocument(); // legend
    expect(screen.getByText("45%")).toBeInTheDocument();
    expect(screen.getByText("30%")).toBeInTheDocument();
    expect(screen.getByText("25%")).toBeInTheDocument();

    const segments = screen.getByTestId("mix-bar").firstElementChild!.children;
    expect(segments).toHaveLength(3);
    expect(segments[0]).toHaveStyle({ width: "45%" });
    expect(segments[1]).toHaveStyle({ width: "30%" });
    expect(segments[2]).toHaveStyle({ width: "25%" });
  });

  it("dragging divider 0 reallocates between name match and popularity", () => {
    renderBar();
    vi.spyOn(screen.getByTestId("mix-bar"), "getBoundingClientRect").mockReturnValue(rect(0, 100));

    fireEvent.pointerDown(screen.getByRole("slider", { name: DIVIDER_0 }));
    fireEvent.pointerMove(window, { clientX: 20 });
    fireEvent.pointerUp(window);

    expect(onChange).toHaveBeenLastCalledWith({ text: 0.2, popularity: 0.55, recency: 0.25 });
  });

  it("dragging divider 1 reallocates between popularity and recency", () => {
    renderBar();
    vi.spyOn(screen.getByTestId("mix-bar"), "getBoundingClientRect").mockReturnValue(
      rect(10, 100), // non-zero origin to prove the offset math
    );

    fireEvent.pointerDown(screen.getByRole("slider", { name: DIVIDER_1 }));
    fireEvent.pointerMove(window, { clientX: 105 }); // (105 − 10) / 100 = 95%
    fireEvent.pointerUp(window);

    expect(onChange).toHaveBeenLastCalledWith({ text: 0.45, popularity: 0.5, recency: 0.05 });
  });

  it("ignores pointer movement when no divider is being dragged", () => {
    renderBar();
    vi.spyOn(screen.getByTestId("mix-bar"), "getBoundingClientRect").mockReturnValue(rect(0, 100));
    fireEvent.pointerMove(window, { clientX: 50 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("arrow keys nudge a divider by 1%, Home/End push it to the extremes", () => {
    renderBar();
    const divider = screen.getByRole("slider", { name: DIVIDER_1 });
    fireEvent.keyDown(divider, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith({ text: 0.45, popularity: 0.31, recency: 0.24 });

    fireEvent.keyDown(divider, { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith({ text: 0.45, popularity: 0.55, recency: 0 });

    fireEvent.keyDown(divider, { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith({ text: 0.45, popularity: 0, recency: 0.55 });
  });
});
