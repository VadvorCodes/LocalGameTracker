import { beforeEach, describe, expect, it } from "vitest";
import {
  applyTheme,
  buildCustomVars,
  cssColor,
  CUSTOM_THEME_ID,
  DEFAULT_CUSTOM_COLOURS,
  DEFAULT_THEME_ID,
  findTheme,
  THEMES,
  themeSwatches,
  themeVars,
  type ThemeVarName,
} from "./themes";

const VARS: ThemeVarName[] = [
  "--surface-950",
  "--surface-900",
  "--surface-800",
  "--surface-700",
  "--surface-600",
  "--accent-400",
  "--accent-500",
  "--accent-600",
];

/** Perceived lightness of an "r g b" triplet string, 0..1. */
function lightness(triplet: string): number {
  const [r, g, b] = triplet.split(/\s+/).map(Number);
  return (r + g + b) / 3 / 255;
}

beforeEach(() => {
  document.documentElement.style.cssText = "";
});

describe("findTheme", () => {
  it("finds presets by id", () => {
    expect(findTheme("ocean").name).toBe("Ocean");
    expect(findTheme("crimson").name).toBe("Crimson");
  });

  it("falls back to Midnight for unknown, null or undefined ids", () => {
    expect(findTheme("nope")).toBe(THEMES[0]);
    expect(findTheme(null)).toBe(THEMES[0]);
    expect(findTheme(undefined)).toBe(THEMES[0]);
    expect(THEMES[0].id).toBe(DEFAULT_THEME_ID);
  });
});

describe("applyTheme", () => {
  it("writes all eight CSS variables onto the document root", () => {
    applyTheme("ocean");
    for (const name of VARS) {
      expect(document.documentElement.style.getPropertyValue(name)).toBe(
        findTheme("ocean").vars[name],
      );
    }
    expect(document.documentElement.style.getPropertyValue("--surface-950")).toBe("6 16 22");
  });

  it("switches between presets", () => {
    applyTheme("midnight");
    expect(document.documentElement.style.getPropertyValue("--accent-500")).toBe("91 124 250");
    applyTheme("violet");
    expect(document.documentElement.style.getPropertyValue("--accent-500")).toBe("158 110 245");
  });
});

describe("themeSwatches / cssColor", () => {
  it("returns four rgb() swatches from surface-900 and the accent steps", () => {
    const midnight = findTheme("midnight");
    expect(themeSwatches(midnight)).toEqual([
      "rgb(17 21 31)",
      "rgb(124 156 255)",
      "rgb(91 124 250)",
      "rgb(68 96 224)",
    ]);
  });

  it("converts a preset variable to a css colour", () => {
    expect(cssColor(findTheme("forest").vars, "--accent-500")).toBe("rgb(52 199 123)");
  });
});

describe("themeVars", () => {
  it("uses the custom derivation only for the custom id with colours provided", () => {
    const colours = { base: "#0b0e14", accent: "#5b7cfa" };
    expect(themeVars(CUSTOM_THEME_ID, colours)).toEqual(buildCustomVars(colours));
    // custom id without colours → preset fallback
    expect(themeVars(CUSTOM_THEME_ID, null)).toEqual(findTheme("midnight").vars);
    // preset id ignores any custom colours
    expect(themeVars("ocean", colours)).toEqual(findTheme("ocean").vars);
  });

  it("resolves the default custom colours to Midnight-dark surfaces", () => {
    const vars = themeVars(CUSTOM_THEME_ID, DEFAULT_CUSTOM_COLOURS);
    expect(vars["--surface-950"]).toBe("11 14 20"); // #0b0e14
    expect(vars["--accent-500"]).toBe("91 124 250"); // #5b7cfa
  });
});

describe("buildCustomVars", () => {
  it("falls back to Midnight when either hex is invalid", () => {
    const midnight = findTheme(DEFAULT_THEME_ID).vars;
    expect(buildCustomVars({ base: "nope", accent: "#5b7cfa" })).toEqual(midnight);
    expect(buildCustomVars({ base: "#0b0e14", accent: "#12345" })).toEqual(midnight);
    expect(buildCustomVars({ base: "", accent: "" })).toEqual(midnight);
  });

  it("keeps surface-950 exactly at the picked base", () => {
    const vars = buildCustomVars({ base: "#1a2b3c", accent: "#5b7cfa" });
    expect(vars["--surface-950"]).toBe("26 43 60");
  });

  it("keeps accent-500 exactly at the picked accent", () => {
    const vars = buildCustomVars({ base: "#0b0e14", accent: "#ff8800" });
    expect(vars["--accent-500"]).toBe("255 136 0");
  });

  it("steps surfaces UP from a dark base", () => {
    const vars = buildCustomVars({ base: "#0b0e14", accent: "#5b7cfa" });
    const l950 = lightness(vars["--surface-950"]);
    const tiers = (
      ["--surface-900", "--surface-800", "--surface-700", "--surface-600"] as const
    ).map((k) => lightness(vars[k]));
    tiers.forEach((l) => expect(l).toBeGreaterThan(l950));
    expect(tiers[0]).toBeLessThan(tiers[1]);
    expect(tiers[1]).toBeLessThan(tiers[2]);
    expect(tiers[2]).toBeLessThan(tiers[3]);
  });

  it("steps surfaces DOWN from a light base so text stays readable", () => {
    const vars = buildCustomVars({ base: "#cccccc", accent: "#5b7cfa" });
    const l950 = lightness(vars["--surface-950"]); // 0.8
    const tiers = (
      ["--surface-900", "--surface-800", "--surface-700", "--surface-600"] as const
    ).map((k) => lightness(vars[k]));
    tiers.forEach((l) => expect(l).toBeLessThan(l950));
    expect(new Set(tiers).size).toBe(4); // tiers stay distinct
  });

  it("keeps every tier distinct even for a base at the readability ceiling", () => {
    // lightness 0.35 → the up-step span would collapse; tiers must still differ
    const vars = buildCustomVars({ base: "#595959", accent: "#5b7cfa" });
    const all = (
      ["--surface-950", "--surface-900", "--surface-800", "--surface-700", "--surface-600"] as const
    ).map((k) => lightness(vars[k]));
    expect(new Set(all).size).toBe(5);
  });

  it("derives lighter and darker accent steps", () => {
    const vars = buildCustomVars({ base: "#0b0e14", accent: "#5b7cfa" });
    const l400 = lightness(vars["--accent-400"]);
    const l500 = lightness(vars["--accent-500"]);
    const l600 = lightness(vars["--accent-600"]);
    expect(l400).toBeGreaterThan(l500);
    expect(l600).toBeLessThan(l500);
  });

  it("clamps the light accent step at 0.88 lightness", () => {
    const vars = buildCustomVars({ base: "#0b0e14", accent: "#ffffff" });
    expect(lightness(vars["--accent-400"])).toBeCloseTo(0.88, 2);
  });

  it("clamps the dark accent floor at 0.3 / 0.18 lightness", () => {
    const vars = buildCustomVars({ base: "#0b0e14", accent: "#000000" });
    expect(lightness(vars["--accent-400"])).toBeCloseTo(0.3, 2);
    expect(lightness(vars["--accent-600"])).toBeCloseTo(0.18, 2);
  });

  it("always returns all eight variables", () => {
    const vars = buildCustomVars({ base: "#0b0e14", accent: "#5b7cfa" });
    expect(Object.keys(vars).sort()).toEqual([...VARS].sort());
  });
});
