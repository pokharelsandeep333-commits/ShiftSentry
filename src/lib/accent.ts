import { createLocalPreference } from "./local-preference";

/**
 * The colour themes a viewer can pick in Settings > Appearance. Most change
 * only the accent (`--primary`, a light and a dark value); Wasp and Creamy are
 * full themes that also bring their own background, cards, borders and text
 * (`surfaces`). `--primary-soft` and `--primary-glow` mix from `--primary`
 * unless a theme sets its own soft wash (Wasp's light mode: black buttons,
 * yellow selection).
 *
 * This list is the only source: `ACCENT_CSS` turns it into the `<html
 * data-accent>` rules, rendered once in `src/app/layout.tsx`, so no stylesheet
 * repeats a value. Violet is the default and lives in globals.css's `:root` /
 * `.dark` tokens, with no attribute. The rules apply on screen only; print
 * keeps its plain white page.
 *
 * Contrast is part of the definition, not a review step. `accent.test.ts`
 * pins 4.5:1 for: white (or the theme's button text) on the light value, the
 * dark ink `#11121a` on the dark value, each value as text on its ground and
 * cards, a full theme's text and muted text on its ground, cards and muted
 * surface, and the dark ink on `bright`.
 *
 * `bright` is `--primary-bright`, the same in both modes: a light fill that
 * carries the dark ink, for the landing's example-week "Campus desk" job. The
 * landing's dashboard captures exist once per theme and mode
 * (`dashboard-<size>[-<id>]-<mode>`) and the page shows the matching one.
 * `swatch` is the two colours the picker shows.
 *
 * Green and amber are left out: they mean "saved / earned" and "warning".
 * Lime (Sandeep's request) is yellow-green enough to read apart from the
 * success green; Wasp's yellow sits nearer the amber warning, which he
 * accepted. Stored per device under `shiftsentry:accent` and applied before
 * first paint by the theme bootstrap, so a chosen theme never flashes violet.
 * It applies on every page, landing and sign-in included (Sandeep's call,
 * 2026-11-22); the landing's 3D render is re-tinted by `renderFilter`.
 */
export type ThemeSurfaces = {
  background: string;
  foreground: string;
  card: string;
  muted: string;
  mutedForeground: string;
  border: string;
  /** `--shadow-color`, as space-separated RGB channels. */
  shadow: string;
};

export type Accent = {
  id: string;
  label: string;
  light: string;
  dark: string;
  bright: string;
  swatch: readonly [string, string];
  surfaces?: { light: ThemeSurfaces; dark: ThemeSurfaces };
  /** Light mode's `--primary-soft`, when it is not mixed from `--primary`. */
  lightSoft?: string;
  /**
   * Light mode's wash colour, when not `--primary`: the landing's glows, the
   * card glow (`--primary-glow`) and the selected nav item's tint
   * (`--accent-wash`, at `--tint-strength`) mix from it. Wasp: black buttons,
   * yellow everything else.
   */
  lightWash?: string;
  /**
   * A CSS filter that recolours the landing's violet 3D render toward this
   * theme (`.hero-art-float img`). One image, re-tinted in the compositor,
   * instead of a render per theme.
   */
  renderFilter?: string;
};

export const ACCENTS = [
  { id: "violet", label: "Violet", light: "#6d5ce7", dark: "#9486ff", bright: "#9486ff", swatch: ["#6d5ce7", "#9486ff"] },
  { id: "blue", label: "Blue", light: "#2563eb", dark: "#6b9bff", bright: "#6b9bff", swatch: ["#2563eb", "#6b9bff"], renderFilter: "hue-rotate(-30deg)" },
  { id: "teal", label: "Teal", light: "#0f766e", dark: "#2dd4bf", bright: "#2dd4bf", swatch: ["#0f766e", "#2dd4bf"], renderFilter: "hue-rotate(-78deg) saturate(0.9)" },
  { id: "pink", label: "Pink", light: "#be185d", dark: "#f472b6", bright: "#f472b6", swatch: ["#be185d", "#f472b6"], renderFilter: "hue-rotate(72deg)" },
  { id: "graphite", label: "Graphite", light: "#344054", dark: "#d0d5dd", bright: "#98a2b3", swatch: ["#344054", "#d0d5dd"], renderFilter: "saturate(0) brightness(1.03)" },
  { id: "lime", label: "Lime", light: "#4d7c0f", dark: "#a3e635", bright: "#a3e635", swatch: ["#4d7c0f", "#a3e635"], renderFilter: "hue-rotate(-155deg) saturate(1.05)" },
  {
    id: "wasp", label: "Wasp", light: "#18181b", dark: "#facc15", bright: "#facc15", swatch: ["#18181b", "#facc15"],
    lightSoft: "color-mix(in srgb, #facc15 40%, transparent)",
    lightWash: "#facc15",
    renderFilter: "hue-rotate(160deg) saturate(1.25) brightness(1.05)",
    surfaces: {
      light: { background: "#fffdf3", foreground: "#18181b", card: "#ffffff", muted: "#f6f2df", mutedForeground: "#66614f", border: "#e9e3cc", shadow: "231 226 204" },
      dark: { background: "#0c0c0d", foreground: "#f5f5f4", card: "#17171a", muted: "#222226", mutedForeground: "#a8a29e", border: "#2f2f34", shadow: "0 0 0" },
    },
  },
  {
    id: "cream", label: "Creamy", light: "#6f4a2a", dark: "#d9bc86", bright: "#d9bc86", swatch: ["#f5efe3", "#6f4a2a"],
    renderFilter: "saturate(0.2) sepia(0.75) hue-rotate(-10deg) brightness(1.03)",
    surfaces: {
      light: { background: "#f5efe3", foreground: "#2b2118", card: "#fffcf6", muted: "#ede4d3", mutedForeground: "#6e5d49", border: "#e2d6c1", shadow: "226 214 194" },
      dark: { background: "#17130f", foreground: "#f3ece0", card: "#211c17", muted: "#2c251e", mutedForeground: "#b5a691", border: "#3b3229", shadow: "0 0 0" },
    },
  },
] as const satisfies readonly Accent[];

export type AccentId = (typeof ACCENTS)[number]["id"];

export const DEFAULT_ACCENT: AccentId = "violet";
export const ACCENT_STORAGE_KEY = "shiftsentry:accent";

const ACCENT_IDS = new Set<string>(ACCENTS.map((accent) => accent.id));

/** A stored value back to a theme, or null for anything this build does not know. */
export function reviveAccent(parsed: unknown): AccentId | null {
  return typeof parsed === "string" && ACCENT_IDS.has(parsed) ? (parsed as AccentId) : null;
}

export const accentPreference = createLocalPreference<AccentId>(ACCENT_STORAGE_KEY, DEFAULT_ACCENT, reviveAccent);

/** Sets `<html data-accent>`, or removes it for the default. */
export function applyAccent(accent: AccentId) {
  if (accent === DEFAULT_ACCENT) delete document.documentElement.dataset.accent;
  else document.documentElement.dataset.accent = accent;
}

function surfaceDeclarations(surfaces: ThemeSurfaces) {
  return `--background:${surfaces.background};--foreground:${surfaces.foreground};--card:${surfaces.card};--muted:${surfaces.muted};--muted-foreground:${surfaces.mutedForeground};--border:${surfaces.border};--shadow-color:${surfaces.shadow};`;
}

/**
 * Each non-default theme as CSS: its light rule, then its dark rule (both
 * selectors weigh the same, so the later one wins on `<html class="dark">`),
 * then its theme-independent `--primary-bright`. Then which landing capture
 * shows (`.welcome-shot`, one per theme and mode; the default's rules match
 * only when no theme is set). A compile-time constant built from this list.
 */
const THEMED: readonly Accent[] = ACCENTS.filter((accent) => accent.id !== DEFAULT_ACCENT);

export const ACCENT_CSS = `@media screen{${THEMED.map((accent) => [
  `:root[data-accent="${accent.id}"]{--primary:${accent.light};${accent.surfaces ? surfaceDeclarations(accent.surfaces.light) : ""}${accent.lightSoft ? `--primary-soft:${accent.lightSoft};` : ""}${accent.lightWash ? `--accent-wash:${accent.lightWash};--primary-glow:color-mix(in srgb,${accent.lightWash} 35%,transparent);--tint-strength:34%;` : ""}}`,
  `.dark[data-accent="${accent.id}"]{--primary:${accent.dark};${accent.surfaces ? surfaceDeclarations(accent.surfaces.dark) : ""}${accent.lightSoft ? "--primary-soft:color-mix(in srgb,var(--primary) 16%,transparent);" : ""}${accent.lightWash ? "--accent-wash:var(--primary);--primary-glow:color-mix(in srgb,var(--primary) 28%,transparent);--tint-strength:initial;" : ""}}`,
  `[data-accent="${accent.id}"]{--primary-bright:${accent.bright};}`,
  accent.renderFilter ? `[data-accent="${accent.id}"] .hero-art-float img{filter:${accent.renderFilter};}` : "",
].join("")).join("")}}
.welcome-shot{display:none}
:root:not([data-accent]):not(.dark) .welcome-shot[data-shot="${DEFAULT_ACCENT}-light"],:root.dark:not([data-accent]) .welcome-shot[data-shot="${DEFAULT_ACCENT}-dark"]{display:block}
${THEMED.map((accent) => `:root[data-accent="${accent.id}"]:not(.dark) .welcome-shot[data-shot="${accent.id}-light"],:root.dark[data-accent="${accent.id}"] .welcome-shot[data-shot="${accent.id}-dark"]{display:block}`).join("\n")}`;

/** The landing capture's file stem for a theme and mode: the default has no theme segment. */
export function captureName(size: "desktop" | "mobile", accent: AccentId, mode: "light" | "dark") {
  return accent === DEFAULT_ACCENT ? `dashboard-${size}-${mode}` : `dashboard-${size}-${accent}-${mode}`;
}

/**
 * The bootstrap's theme step, as a constant script fragment: the stored raw
 * value is compared against the JSON spelling of each known non-default id,
 * never parsed or echoed into the page.
 */
export const ACCENT_BOOTSTRAP = `
  var a = localStorage.getItem(${JSON.stringify(ACCENT_STORAGE_KEY)});
  var known = ${JSON.stringify(ACCENTS.filter((accent) => accent.id !== DEFAULT_ACCENT).map((accent) => JSON.stringify(accent.id)))};
  if (known.indexOf(a) !== -1) document.documentElement.dataset.accent = JSON.parse(a);
`;
