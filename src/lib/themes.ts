/**
 * Colour theme presets. Each preset supplies "r g b" triplets for the CSS
 * variables declared in index.css; tailwind.config.js maps those variables
 * into the `surface-*` / `accent-*` Tailwind colours, so switching a theme
 * recolours the whole app.
 */
import type { CustomThemeColours, ThemeId } from "../types";

/** The eight CSS custom property names every palette must define (see index.css). */
export type ThemeVarName =
  | "--surface-950"
  | "--surface-900"
  | "--surface-800"
  | "--surface-700"
  | "--surface-600"
  | "--accent-400"
  | "--accent-500"
  | "--accent-600";

/** A full palette: "r g b" triplets keyed by CSS variable name. */
export type ThemeVars = Record<ThemeVarName, string>;

export interface ThemePreset {
  id: ThemeId;
  name: string;
  vars: ThemeVars;
}

export const DEFAULT_THEME_ID: ThemeId = "midnight";
export const CUSTOM_THEME_ID: ThemeId = "custom";

export const DEFAULT_CUSTOM_COLOURS: CustomThemeColours = {
  base: "#0b0e14",
  accent: "#5b7cfa",
};

// Keep the Midnight palette in sync with the :root block in index.css — two
// sources of truth: index.css seeds the first paint before JS runs, this
// module (THEMES[0] / applyTheme) takes over at runtime.
export const THEMES: ThemePreset[] = [
  {
    id: "midnight",
    name: "Midnight",
    vars: {
      "--surface-950": "11 14 20",
      "--surface-900": "17 21 31",
      "--surface-800": "24 29 42",
      "--surface-700": "35 42 61",
      "--surface-600": "47 56 80",
      "--accent-400": "124 156 255",
      "--accent-500": "91 124 250",
      "--accent-600": "68 96 224",
    },
  },
  {
    id: "ocean",
    name: "Ocean",
    vars: {
      "--surface-950": "6 16 22",
      "--surface-900": "9 24 33",
      "--surface-800": "12 32 44",
      "--surface-700": "17 44 60",
      "--surface-600": "23 58 78",
      "--accent-400": "77 214 236",
      "--accent-500": "34 190 216",
      "--accent-600": "14 155 183",
    },
  },
  {
    id: "forest",
    name: "Forest",
    vars: {
      "--surface-950": "8 15 12",
      "--surface-900": "13 23 18",
      "--surface-800": "18 31 25",
      "--surface-700": "26 44 35",
      "--surface-600": "35 58 46",
      "--accent-400": "110 231 168",
      "--accent-500": "52 199 123",
      "--accent-600": "24 160 92",
    },
  },
  {
    id: "sunset",
    name: "Sunset",
    vars: {
      "--surface-950": "18 12 10",
      "--surface-900": "26 17 14",
      "--surface-800": "36 23 19",
      "--surface-700": "52 33 27",
      "--surface-600": "70 44 36",
      "--accent-400": "251 176 108",
      "--accent-500": "245 146 62",
      "--accent-600": "214 112 34",
    },
  },
  {
    id: "violet",
    name: "Violet",
    vars: {
      "--surface-950": "13 11 20",
      "--surface-900": "19 16 29",
      "--surface-800": "26 22 40",
      "--surface-700": "37 31 56",
      "--surface-600": "49 41 75",
      "--accent-400": "196 158 255",
      "--accent-500": "158 110 245",
      "--accent-600": "126 74 214",
    },
  },
  {
    id: "crimson",
    name: "Crimson",
    vars: {
      "--surface-950": "17 10 13",
      "--surface-900": "25 14 19",
      "--surface-800": "34 19 26",
      "--surface-700": "50 27 37",
      "--surface-600": "67 36 50",
      "--accent-400": "251 113 133",
      "--accent-500": "232 68 96",
      "--accent-600": "196 30 66",
    },
  },
];

export function findTheme(id: string | null | undefined): ThemePreset {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

/** Apply a theme preset (or the custom colours) to the document root. */
export function applyTheme(
  id: string | null | undefined,
  custom?: CustomThemeColours | null,
): void {
  for (const [name, value] of Object.entries(themeVars(id, custom))) {
    document.documentElement.style.setProperty(name, value);
  }
}

/** The theme's own colours, for swatch previews independent of the active theme. */
export function themeSwatches(theme: ThemePreset): string[] {
  return [
    theme.vars["--surface-900"],
    theme.vars["--accent-400"],
    theme.vars["--accent-500"],
    theme.vars["--accent-600"],
  ].map((rgb) => `rgb(${rgb})`);
}

/** A palette variable as a ready-to-use CSS colour string ("r g b" → "rgb(r g b)"). */
export function cssColor(vars: ThemeVars, name: ThemeVarName): string {
  return `rgb(${vars[name]})`;
}

// --- custom theme colour math -------------------------------------------

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = Math.round(h * 60);
  if (h < 0) h += 360;
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rgb: [number, number, number];
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return rgb.map((v) => Math.round((v + m) * 255)) as [number, number, number];
}

const triplet = (rgb: [number, number, number]) => rgb.join(" ");

/**
 * Derive the full 8-variable palette from the two picked colours: surfaces
 * keep the base colour's hue/saturation and step away from it in lightness —
 * up for a dark base (toward the 0.35 readability ceiling), down for a light
 * or mid base — so the four surface tiers always stay distinct. Accent 400/600
 * are lighter/darker accent steps.
 */
export function buildCustomVars(colours: CustomThemeColours): ThemeVars {
  const base = hexToRgb(colours.base);
  const accent = hexToRgb(colours.accent);
  if (!base || !accent) return findTheme(DEFAULT_THEME_ID).vars;

  const [bh, bs, bl] = rgbToHsl(...base);
  // Stepping up is compressed toward the readability ceiling as the base
  // approaches it — clamping the offsets instead would collapse every tier
  // onto one identical value (any base at lightness ≥ ~0.31). A minimum span
  // keeps the tiers distinct even then; at or above the ceiling the tiers step
  // down instead (the app's text is fixed light, so surfaces must stay darker
  // than the base to keep cards and panels readable).
  const READABLE_CEILING = 0.35;
  const MAX_SPAN = 0.19;
  const MIN_SPAN = 0.06;
  const TIER_DELTAS = [0.04, 0.08, 0.13, 0.19];
  const stepUp = bl < READABLE_CEILING;
  const span = stepUp ? Math.min(MAX_SPAN, Math.max(READABLE_CEILING - bl, MIN_SPAN)) : MAX_SPAN;
  const surface = (dL: number) => {
    const l = stepUp ? bl + span * (dL / MAX_SPAN) : bl - span * (dL / MAX_SPAN);
    return triplet(hslToRgb(bh, bs, Math.min(1, Math.max(0, l))));
  };

  const [ah, as_, al] = rgbToHsl(...accent);
  const accentStep = (dL: number, lo: number) =>
    triplet(hslToRgb(ah, as_, Math.min(0.88, Math.max(lo, al + dL))));

  return {
    "--surface-950": triplet(base),
    "--surface-900": surface(TIER_DELTAS[0]),
    "--surface-800": surface(TIER_DELTAS[1]),
    "--surface-700": surface(TIER_DELTAS[2]),
    "--surface-600": surface(TIER_DELTAS[3]),
    "--accent-400": accentStep(0.12, 0.3),
    "--accent-500": triplet(accent),
    "--accent-600": accentStep(-0.1, 0.18),
  };
}

/** The active theme's variables, resolving the custom theme's picked colours. */
export function themeVars(
  id: string | null | undefined,
  custom?: CustomThemeColours | null,
): ThemeVars {
  if (id === CUSTOM_THEME_ID && custom) return buildCustomVars(custom);
  return findTheme(id).vars;
}
