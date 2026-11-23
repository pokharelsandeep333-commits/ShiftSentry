import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { ACCENT_BOOTSTRAP, ACCENT_CSS, ACCENT_STORAGE_KEY, ACCENTS, captureName, DEFAULT_ACCENT, reviveAccent, SMALL_CAPTURE_SUFFIX, type Accent } from "./accent";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const DEFAULT_SURFACES = { light: { background: "#f7f8fa", card: "#ffffff" }, dark: { background: "#101318", card: "#171b22" } };
const INK = "#11121a";

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** `color-mix(in srgb, top share%, bottom)` for two opaque hex colours. */
function mix(top: string, bottom: string, share: number) {
  return `#${[1, 3, 5].map((i) => Math.round(parseInt(top.slice(i, i + 2), 16) * share + parseInt(bottom.slice(i, i + 2), 16) * (1 - share)).toString(16).padStart(2, "0")).join("")}`;
}

function atLeast(a: string, b: string, label: string) {
  assert.ok(contrast(a, b) >= 4.5, `${label}: ${a} on ${b} is ${contrast(a, b).toFixed(2)}:1`);
}

const themes: readonly Accent[] = ACCENTS;

test("reviveAccent keeps known themes and drops anything else", () => {
  for (const accent of ACCENTS) assert.equal(reviveAccent(accent.id), accent.id);
  for (const value of ["", "Blue", "red", 3, null, undefined, {}, ["blue"]]) assert.equal(reviveAccent(value), null);
});

test("every theme reads at 4.5:1 or better where it is used", () => {
  for (const accent of themes) {
    const light = accent.surfaces?.light ?? DEFAULT_SURFACES.light;
    const dark = accent.surfaces?.dark ?? DEFAULT_SURFACES.dark;
    atLeast("#ffffff", accent.light, `${accent.id} light button text`);
    atLeast(accent.light, light.background, `${accent.id} light link on ground`);
    atLeast(accent.light, light.card, `${accent.id} light link on card`);
    atLeast(INK, accent.dark, `${accent.id} dark button text`);
    atLeast(accent.dark, dark.background, `${accent.id} dark link on ground`);
    atLeast(accent.dark, dark.card, `${accent.id} dark link on card`);
    atLeast(INK, accent.bright, `${accent.id} ink on bright fill`);
  }
});

test("a full theme's text and muted text read on its ground, cards and muted surface", () => {
  for (const accent of themes) {
    if (!accent.surfaces) continue;
    for (const [mode, surfaces] of Object.entries(accent.surfaces)) {
      for (const ground of [surfaces.background, surfaces.card, surfaces.muted]) {
        atLeast(surfaces.foreground, ground, `${accent.id} ${mode} text`);
        atLeast(surfaces.mutedForeground, ground, `${accent.id} ${mode} muted text`);
      }
    }
  }
});

test("a theme's own warning ink reads on its ground, cards, muted surface and the warning wash", () => {
  for (const accent of themes) {
    if (!accent.warning) continue;
    for (const mode of ["light", "dark"] as const) {
      const surfaces = accent.surfaces?.[mode] ?? { ...DEFAULT_SURFACES[mode], muted: undefined };
      const { fill, ink } = accent.warning[mode];
      const grounds = [surfaces.background, surfaces.card, surfaces.muted].filter((ground): ground is string => Boolean(ground));
      for (const ground of grounds) {
        atLeast(ink, ground, `${accent.id} ${mode} warning ink`);
        // The badge and banner wash: the fill at 12% over the card (week-card.tsx), 14% over the ground.
        atLeast(ink, mix(fill, ground, 0.14), `${accent.id} ${mode} warning ink on its wash`);
      }
    }
  }
});

test("Wasp's warning is red-orange, apart from its yellow", () => {
  const wasp: Accent = ACCENTS.find((accent) => accent.id === "wasp")!;
  assert.ok(wasp.warning, "wasp warning");
  for (const mode of ["light", "dark"] as const) {
    const fill = wasp.warning[mode].fill;
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(fill.slice(i, i + 2), 16) / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const hue = max === r ? (60 * (g - b)) / (max - min) : NaN;
    assert.ok(hue >= 12 && hue <= 26, `${mode} hue ${hue.toFixed(0)}`);
    assert.ok(ACCENT_CSS.includes(`--warning:${fill};--warning-ink:${wasp.warning[mode].ink};`), `${mode} warning rule`);
  }
});

test("the default's values are globals.css's own tokens", () => {
  const violet = themes.find((accent) => accent.id === DEFAULT_ACCENT)!;
  assert.match(css, new RegExp(`:root \\{[^}]*--primary: ${violet.light};`));
  assert.match(css, new RegExp(`\\.dark \\{[^}]*--primary: ${violet.dark};`));
  assert.match(css, new RegExp(`:root \\{[^}]*--primary-bright: ${violet.bright};`));
});

test("only globals.css's theme tokens set --primary, so the chosen theme reaches every page", () => {
  const setters = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, , body]) => /--primary:\s*#/.test(body))
    .map(([, selector]) => selector.replace(/\/\*[\s\S]*?\*\//g, "").trim());
  assert.deepEqual(setters, [":root", ".dark"]);
});

test("ACCENT_CSS has each theme's light rule before its dark rule, on screen only", () => {
  assert.ok(ACCENT_CSS.startsWith("@media screen{"));
  for (const accent of themes.filter((option) => option.id !== DEFAULT_ACCENT)) {
    const light = ACCENT_CSS.indexOf(`:root[data-accent="${accent.id}"]{--primary:${accent.light};`);
    const dark = ACCENT_CSS.indexOf(`.dark[data-accent="${accent.id}"]{--primary:${accent.dark};`);
    assert.ok(light !== -1 && dark !== -1 && light < dark, `${accent.id} rules`);
    assert.ok(ACCENT_CSS.includes(`[data-accent="${accent.id}"]{--primary-bright:${accent.bright};}`), `${accent.id} bright`);
    if (accent.surfaces) assert.ok(ACCENT_CSS.includes(`--background:${accent.surfaces.dark.background};`), `${accent.id} dark surfaces`);
  }
  assert.doesNotMatch(ACCENT_CSS, /<|undefined/);
});

test("every theme has its landing captures, in both formats", () => {
  for (const accent of ACCENTS) for (const size of ["desktop", "mobile"] as const) for (const mode of ["light", "dark"] as const) {
    const stem = captureName(size, accent.id, mode);
    // The desktop shot also has a half-width copy for phones (the landing's srcset).
    const stems = size === "desktop" ? [stem, `${stem}${SMALL_CAPTURE_SUFFIX}`] : [stem];
    for (const name of stems) for (const format of ["webp", "avif"]) {
      assert.ok(existsSync(new URL(`../../public/welcome/${name}.${format}`, import.meta.url)), `${name}.${format}`);
      assert.ok(existsSync(new URL(`../../public/welcome/${name}.${format}.json`, import.meta.url)), `${name}.${format}.json`);
    }
    assert.ok(ACCENT_CSS.includes(`[data-shot="${accent.id}-${mode}"]`), `${accent.id}-${mode} shot rule`);
  }
});

function runBootstrap(stored: string | null) {
  const dataset: Record<string, string> = {};
  const localStorage = { getItem: (key: string) => (key === ACCENT_STORAGE_KEY ? stored : null) };
  const document = { documentElement: { dataset } };
  new Function("localStorage", "document", ACCENT_BOOTSTRAP)(localStorage, document);
  return dataset.accent;
}

test("the pre-paint bootstrap applies only known, non-default themes", () => {
  assert.equal(runBootstrap(JSON.stringify("blue")), "blue");
  assert.equal(runBootstrap(JSON.stringify("cream")), "cream");
  assert.equal(runBootstrap(JSON.stringify(DEFAULT_ACCENT)), undefined);
  assert.equal(runBootstrap(null), undefined);
  assert.equal(runBootstrap("blue"), undefined);
  assert.equal(runBootstrap(JSON.stringify("red")), undefined);
  assert.equal(runBootstrap('"x" onload="alert(1)"'), undefined);
});
