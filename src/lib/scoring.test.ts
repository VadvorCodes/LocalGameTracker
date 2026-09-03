import { describe, expect, it } from "vitest";
import { computeWeightedOverall } from "./scoring";

const W = { gameplay: 25, story: 25, music: 25, technical: 25 };
const empty = { gameplay: null, story: null, music: null, technical: null };

describe("computeWeightedOverall", () => {
  it("returns null when nothing is filled in", () => {
    expect(computeWeightedOverall(empty, W)).toBeNull();
  });

  it("returns the single filled score as-is", () => {
    expect(computeWeightedOverall({ ...empty, gameplay: 80 }, W)).toBe(80);
  });

  it("weights the filled categories by the profile weights", () => {
    const scores = { ...empty, gameplay: 90, story: 40 };
    const weights = { gameplay: 60, story: 40, music: 0, technical: 0 };
    expect(computeWeightedOverall(scores, weights)).toBe(70); // 90*0.6 + 40*0.4
  });

  it("renormalises weights over only the filled categories", () => {
    const scores = { ...empty, gameplay: 100, music: 50 };
    // gameplay and music each get half of the total weight.
    expect(computeWeightedOverall(scores, W)).toBe(75);
  });

  it("falls back to an unweighted mean when total weight is zero", () => {
    const scores = { ...empty, gameplay: 60, story: 90 };
    const zero = { gameplay: 0, story: 0, music: 0, technical: 0 };
    expect(computeWeightedOverall(scores, zero)).toBe(75);
  });

  it("falls back to an unweighted mean when total weight is negative", () => {
    const scores = { ...empty, gameplay: 30, music: 60 };
    const negative = { gameplay: -10, story: 0, music: 0, technical: 0 };
    expect(computeWeightedOverall(scores, negative)).toBe(45);
  });

  it("rounds to one decimal", () => {
    const scores = { ...empty, gameplay: 10, story: 20 };
    const weights = { gameplay: 1, story: 2, music: 0, technical: 0 };
    expect(computeWeightedOverall(scores, weights)).toBe(16.7); // 50/3
  });

  it("returns whole numbers without decimal noise", () => {
    const scores = { ...empty, gameplay: 77 };
    expect(computeWeightedOverall(scores, W)).toBe(77);
  });
});
