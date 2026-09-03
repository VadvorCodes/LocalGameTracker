import { describe, expect, it } from "vitest";
import { divergenceText, formatDate, formatPlaytime, metaLine, scoreColor } from "./format";

describe("formatPlaytime", () => {
  it("formats zero and negative as 0h", () => {
    expect(formatPlaytime(0)).toBe("0h");
    expect(formatPlaytime(-90)).toBe("0h");
  });

  it("formats minutes only when under an hour", () => {
    expect(formatPlaytime(45)).toBe("45m");
  });

  it("formats whole hours", () => {
    expect(formatPlaytime(120)).toBe("2h");
  });

  it("formats mixed hours and minutes", () => {
    expect(formatPlaytime(125)).toBe("2h 5m");
  });

  it("handles a single minute", () => {
    expect(formatPlaytime(1)).toBe("1m");
  });
});

describe("formatDate", () => {
  it("renders null as an em dash", () => {
    expect(formatDate(null)).toBe("—");
  });

  it("formats a plain YYYY-MM-DD date without timezone shift", () => {
    const out = formatDate("2020-06-15");
    // If the T00:00:00 guard were missing, some timezones would shift this to
    // Jun 14 or Jun 16; assert the local components all match June 15 2020.
    expect(out).toContain("2020");
    expect(out).toContain("Jun");
    expect(out).toContain("15");
  });

  it("formats a full timestamp", () => {
    const out = formatDate("2021-11-02T18:30:00");
    expect(out).toContain("2021");
    expect(out).toContain("Nov");
    expect(out).toContain("2");
  });

  it("returns an unparseable date string unchanged", () => {
    expect(formatDate("whenever")).toBe("whenever");
  });
});

describe("scoreColor", () => {
  it("uses emerald at and above 75", () => {
    expect(scoreColor(75)).toBe("text-emerald-300");
    expect(scoreColor(100)).toBe("text-emerald-300");
  });

  it("uses amber between 50 and 75", () => {
    expect(scoreColor(50)).toBe("text-amber-300");
    expect(scoreColor(74.9)).toBe("text-amber-300");
  });

  it("uses rose below 50", () => {
    expect(scoreColor(49.9)).toBe("text-rose-300");
    expect(scoreColor(0)).toBe("text-rose-300");
  });
});

describe("divergenceText", () => {
  it("flags gut-feeling games when stars outshine the score by 15+", () => {
    expect(divergenceText(5, 80)).toBe(
      "Your star rating is well above your detailed score — a game you love more than its parts.",
    );
    expect(divergenceText(4, 65)).toBe(
      "Your star rating is well above your detailed score — a game you love more than its parts.",
    );
  });

  it("flags on-reflection games when the score outshines stars by 15+", () => {
    expect(divergenceText(1, 80)).toBe(
      "Your detailed score is well above your star rating — impressive pieces that didn't quite win you over.",
    );
    expect(divergenceText(3, 75)).toBe(
      "Your detailed score is well above your star rating — impressive pieces that didn't quite win you over.",
    );
  });

  it("reports agreement within the ±15 band", () => {
    expect(divergenceText(4, 80)).toBe(
      "Your star rating and detailed score agree — a settled opinion.",
    );
    expect(divergenceText(4, 85)).toBe(
      "Your star rating and detailed score agree — a settled opinion.",
    );
    expect(divergenceText(4, 70)).toBe(
      "Your star rating and detailed score agree — a settled opinion.",
    );
  });
});

describe("metaLine", () => {
  it("joins the defined parts with middots", () => {
    expect(metaLine("Team Cherry", "Feb 2017", "Metroidvania", "Action")).toBe(
      "Team Cherry · Feb 2017 · Metroidvania · Action",
    );
  });

  it("drops null, undefined and empty parts", () => {
    expect(metaLine(null, "Solo", undefined, "", "Roguelike")).toBe("Solo · Roguelike");
  });

  it("returns an empty string when no part is defined", () => {
    expect(metaLine(null, undefined, "")).toBe("");
  });
});
