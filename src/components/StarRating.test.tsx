import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { StarPicker, Stars } from "./StarRating";

/** The clipped overlay width per star ("100%", "50%", "0%"), in star order. */
function starFills(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-testid="star-fill"]')).map(
    (el) => el.style.width,
  );
}

describe("Stars (read-only)", () => {
  it("renders 'not rated' for null", () => {
    render(<Stars value={null} />);
    expect(screen.getByText("not rated")).toBeInTheDocument();
  });

  it("exposes the value in the title and clips fills at halves", () => {
    const { container } = render(<Stars value={2.5} />);
    expect(container.querySelector('[title="2.5 / 5 stars"]')).toBeInTheDocument();
    expect(starFills(container)).toEqual(["100%", "100%", "50%", "0%", "0%"]);
  });

  it("fills all five for a 5", () => {
    const { container } = render(<Stars value={5} />);
    expect(starFills(container)).toEqual(["100%", "100%", "100%", "100%", "100%"]);
  });
});

describe("StarPicker", () => {
  it("shows a caption for null and filled values", () => {
    const { rerender } = render(<StarPicker value={null} onChange={() => {}} />);
    expect(screen.getByText("No star rating")).toBeInTheDocument();
    rerender(<StarPicker value={4.5} onChange={() => {}} />);
    expect(screen.getByText("4.5 / 5")).toBeInTheDocument();
  });

  it("labels half and full zones for each star", () => {
    render(<StarPicker value={null} onChange={() => {}} />);
    for (const v of [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]) {
      expect(screen.getByLabelText(`${v} stars`)).toBeInTheDocument();
    }
  });

  it("picks half and whole values", () => {
    const onChange = vi.fn();
    render(<StarPicker value={null} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("3.5 stars"));
    expect(onChange).toHaveBeenLastCalledWith(3.5);
    fireEvent.click(screen.getByLabelText("5 stars"));
    expect(onChange).toHaveBeenLastCalledWith(5);
  });

  it("clicking the current value clears the rating", () => {
    const onChange = vi.fn();
    render(<StarPicker value={4} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("4 stars"));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("clicking a half zone of the same star clears a whole rating", () => {
    const onChange = vi.fn();
    render(<StarPicker value={3} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("3.5 stars"));
    // 3.5 !== 3, so it is a new value, not a clear
    expect(onChange).toHaveBeenCalledWith(3.5);
  });

  it("previews hover values in the fills and resets on mouse leave", () => {
    const { container } = render(<StarPicker value={3} onChange={() => {}} />);
    expect(starFills(container)).toEqual(["100%", "100%", "100%", "0%", "0%"]);

    fireEvent.mouseEnter(screen.getByLabelText("4.5 stars"));
    expect(starFills(container)).toEqual(["100%", "100%", "100%", "100%", "50%"]);

    fireEvent.mouseLeave(container.querySelector("div.select-none")!);
    expect(starFills(container)).toEqual(["100%", "100%", "100%", "0%", "0%"]);
  });
});
