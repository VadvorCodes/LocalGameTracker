import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import CategoryScoreEditor, {
  categoryScoresDirty,
  categoryScoresOf,
  emptyCategoryScores,
  OverallScorePreview,
  type CategoryScores,
} from "./CategoryScoreEditor";

const WEIGHTS = { gameplay: 50, story: 25, music: 15, technical: 10 };

function renderEditor(
  scores: CategoryScores = emptyCategoryScores(),
  props: Partial<Parameters<typeof CategoryScoreEditor>[0]> = {},
) {
  const onChange = vi.fn();
  render(
    <div className="space-y-4">
      <CategoryScoreEditor scores={scores} onChange={onChange} weights={WEIGHTS} {...props} />
    </div>,
  );
  return { onChange };
}

describe("CategoryScoreEditor", () => {
  it("renders one slider per category with its weight label and value", () => {
    renderEditor({ gameplay: 70, story: null, music: 40, technical: null });
    expect(screen.getByText(/Gameplay/).textContent).toContain("(50%)");
    expect(screen.getByText(/Storytelling/).textContent).toContain("(25%)");
    expect(screen.getByText(/Music/).textContent).toContain("(15%)");
    expect(screen.getByText(/Technical Performance/).textContent).toContain("(10%)");
    expect(screen.getByText("70")).toBeInTheDocument();
    expect(screen.getByText("40")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBe(2); // the two unset categories
    expect(screen.getAllByRole("slider")).toHaveLength(4);
  });

  it("reports previously saved scores as 'was N' next to the weight", () => {
    renderEditor(emptyCategoryScores(), {
      previous: { gameplay: 70, story: null, music: 55, technical: null },
    });
    expect(screen.getByText(/Gameplay/).textContent).toContain("was 70");
    expect(screen.getByText(/Music/).textContent).toContain("was 55");
    expect(screen.getByText(/Storytelling/).textContent).not.toContain("was");
  });

  it("moves a single category through onChange", () => {
    const { onChange } = renderEditor(emptyCategoryScores());
    fireEvent.change(screen.getAllByRole("slider")[1], { target: { value: "60" } });
    expect(onChange).toHaveBeenCalledWith({
      gameplay: null,
      story: 60,
      music: null,
      technical: null,
    });
  });

  it("shows unset sliders at the 50 position", () => {
    renderEditor();
    expect(screen.getAllByRole("slider")[3]).toHaveValue("50");
  });
});

describe("OverallScorePreview", () => {
  it("renders the value with the / 100 scale suffix when asked", () => {
    render(<OverallScorePreview value={73.3} showScale />);
    const preview = screen.getByText("73.3").closest("div")!;
    expect(preview.textContent).toBe("73.3 / 100");
  });

  it("renders an em dash for an all-unset draft, still with the suffix", () => {
    render(<OverallScorePreview value={null} showScale />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders the previous overall as 'was N' when given", () => {
    render(<OverallScorePreview value={62.5} was={80} />);
    expect(screen.getByText("62.5")).toBeInTheDocument();
    expect(screen.getByText("was 80.0")).toBeInTheDocument();
  });

  it("omits the 'was' line when the previous overall is unset", () => {
    render(<OverallScorePreview value={62.5} was={null} />);
    expect(screen.queryByText(/was/)).toBeNull();
  });
});

describe("category score helpers", () => {
  it("categoryScoresDirty spots any differing category", () => {
    const saved = { gameplay: 70, story: null, music: null, technical: null };
    expect(categoryScoresDirty(saved, saved)).toBe(false);
    expect(categoryScoresDirty({ ...saved, music: 40 }, saved)).toBe(true);
    expect(categoryScoresDirty({ ...saved, story: null }, saved)).toBe(false);
  });

  it("categoryScoresOf lifts an entry's saved scores into a draft", () => {
    expect(categoryScoresOf({ gameplay: 70, story: 60, music: null, technical: 10 })).toEqual({
      gameplay: 70,
      story: 60,
      music: null,
      technical: 10,
    });
  });
});
