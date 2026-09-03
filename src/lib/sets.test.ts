import { describe, expect, it } from "vitest";
import { toggleSet } from "./sets";

describe("toggleSet", () => {
  it("adds a missing value", () => {
    expect(toggleSet(new Set(["a"]), "b")).toEqual(new Set(["a", "b"]));
  });

  it("removes a present value", () => {
    expect(toggleSet(new Set(["a", "b"]), "a")).toEqual(new Set(["b"]));
  });

  it("does not mutate the input set", () => {
    const original = new Set(["a"]);
    toggleSet(original, "a");
    expect(original).toEqual(new Set(["a"]));
  });

  it("keeps other members and works for non-string values", () => {
    expect(toggleSet(new Set([1, 2, 3]), 2)).toEqual(new Set([1, 3]));
  });
});
