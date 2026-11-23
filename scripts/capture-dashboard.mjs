// Captures the landing page's dashboard screenshots (public/welcome/dashboard-*)
// end to end. Run it when the dashboard's look or a colour theme changes:
//
//   npm run capture:dashboard
//   npm run capture:dashboard -- --skip-build   (reuse the demo build in .next)
//
// What it does, in order:
//   1. `next build` in demo mode: NEXT_PUBLIC_SUPABASE_URL and
//      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are passed as empty strings, which
//      @next/env treats as already defined, so .env.local never applies (and is
//      never touched). This leaves a demo build in .next: run `npm run build`
//      again before using .next for anything else.
//   2. `next start` on port 3100 with the server clock pinned to
//      2026-11-19T18:00:00Z (Thursday afternoon in the demo's zone) through
//      the --require preload in scripts/capture-dashboard/fake-date.cjs. Only
//      that moment tells the story in the landing's alt text: 16 of 20 hours, the 80% warning, Campus
//      desk near its cap, $136.40 earned.
//   3. Headless Edge or Chrome over the DevTools protocol (set BROWSER to a
//      Chromium binary if neither default path exists). Before each load the
//      page gets `theme` and `shiftsentry:accent` in localStorage and the same
//      pinned clock. Desktop is 1440x952 (a height that ends in the gap below
//      the pay and Up next row, so no card is cut), phone 390x844, both at 1x.
//   4. Every colour theme in ACCENTS (src/lib/accent.ts) x light/dark x
//      desktop/phone, named by `captureName`: WebP quality 82 and AVIF quality
//      70, effort 6, 4:4:4, each with a `.json` sidecar. The desktop shot also
//      gets a 720px-wide copy (`SMALL_CAPTURE_SUFFIX`) that phones load through
//      the landing's srcset.
//
// Run through tsx (the npm script does) so it can import the theme list from
// accent.ts. `sharp` is the copy Next already installs, not a declared
// dependency.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { ACCENTS, captureName, SMALL_CAPTURE_SUFFIX, SMALL_CAPTURE_WIDTH } from "../src/lib/accent.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "public", "welcome");
const PRELOAD = join(ROOT, "scripts", "capture-dashboard", "fake-date.cjs");
const NEXT_BIN = join(ROOT, "node_modules", "next", "dist", "bin", "next");
const PORT = 3100;
const BASE = `http://localhost:${PORT}/`;
const CLOCK = "2026-11-19T18:00:00Z";
const SIZES = {
  desktop: { width: 1440, height: 952, mobile: false },
  mobile: { width: 390, height: 844, mobile: true },
};
const MODES = ["light", "dark"];
const WEBP = { quality: 82 };
const AVIF = { quality: 70, effort: 6, chromaSubsampling: "4:4:4" };
// After the load event: fonts, the bootstrap's theme, and the chart's entry
// animation (Recharts, isAnimationActive) need to settle.
const SETTLE_MS = 2500;

const DEMO_ENV = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "", NEXT_TELEMETRY_DISABLED: "1" };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const browserPath = [
  process.env.BROWSER,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].find((candidate) => candidate && existsSync(candidate));
if (!browserPath) throw new Error("No Chromium browser found; set BROWSER.");

if (await respond(BASE)) throw new Error(`Something already answers on port ${PORT}; stop it first so the capture cannot photograph another server.`);

if (!process.argv.includes("--skip-build")) {
  console.log("Building in demo mode…");
  await run(process.execPath, [NEXT_BIN, "build"], { env: DEMO_ENV });
}

console.log(`Starting the demo server on ${BASE} with the clock at ${CLOCK}…`);
const server = spawn(process.execPath, [NEXT_BIN, "start", "-p", String(PORT)], {
  cwd: ROOT,
  env: { ...DEMO_ENV, CAPTURE_CLOCK: CLOCK, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --require ${JSON.stringify(PRELOAD.replace(/\\/g, "/"))}`.trim() },
  stdio: ["ignore", "inherit", "inherit"],
});
const profile = mkdtempSync(join(tmpdir(), "shiftsentry-capture-"));
let browser;

try {
  await waitForServer();
  const html = await (await fetch(BASE)).text();
  if (!html.includes("Sample data")) throw new Error("The server is not rendering the demo dashboard; check that demo mode took effect.");
  if (!html.includes("136.40")) throw new Error("The demo week does not show $136.40; the pinned clock did not take effect, or the demo data changed (then update the landing's alt text too).");

  browser = spawn(browserPath, [
    "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
    "--hide-scrollbars", "--no-first-run", "--no-default-browser-check", "--force-color-profile=srgb", "about:blank",
  ], { stdio: "ignore" });
  const cdp = await connect(profile);
  await cdp.send("Page.enable");

  const createdAt = new Date().toISOString();
  let count = 0;
  for (const [size, metrics] of Object.entries(SIZES)) for (const accent of ACCENTS) for (const mode of MODES) {
    const png = await capture(cdp, metrics, accent.id, mode);
    const stem = captureName(size, accent.id, mode);
    const what = `${metrics.width}x${metrics.height} in the ${accent.id} colour theme, ${mode} mode`;
    await encode(png, stem, what, createdAt);
    if (size === "desktop") {
      const small = await sharp(png).resize({ width: SMALL_CAPTURE_WIDTH, kernel: "lanczos3" }).png().toBuffer();
      const { height } = await sharp(small).metadata();
      await encode(small, `${stem}${SMALL_CAPTURE_SUFFIX}`, `${what}, downscaled to ${SMALL_CAPTURE_WIDTH}x${height} (lanczos3) for phones`, createdAt);
    }
    count += 1;
    console.log("wrote", stem);
  }
  cdp.close();
  console.log(`Done: ${count} captures in public/welcome.`);
} finally {
  if (browser) browser.kill();
  await stop(server);
  for (let attempt = 0; attempt < 10; attempt++) {
    try { rmSync(profile, { recursive: true, force: true }); break; } catch { await sleep(300); }
  }
}

/** Loads the demo dashboard with one theme and mode, and returns a PNG of the viewport. */
async function capture(cdp, metrics, accent, mode) {
  const { identifier } = await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `(() => {
      const R = Date, off = R.parse(${JSON.stringify(CLOCK)}) - R.now();
      class D extends R { constructor(...a) { if (a.length === 0) super(R.now() + off); else super(...a); } static now() { return R.now() + off; } static parse(v) { return R.parse(v); } static UTC(...a) { return R.UTC(...a); } }
      globalThis.Date = D;
      try {
        localStorage.setItem("theme", ${JSON.stringify(mode)});
        localStorage.setItem("shiftsentry:accent", ${JSON.stringify(JSON.stringify(accent))});
        localStorage.removeItem("shiftsentry:sidebar");
      } catch {}
    })();`,
  });
  try {
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: metrics.width, height: metrics.height, deviceScaleFactor: 1, mobile: metrics.mobile });
    const loaded = cdp.once("Page.loadEventFired");
    await cdp.send("Page.navigate", { url: BASE });
    await loaded;
    await cdp.send("Runtime.evaluate", { expression: "document.fonts.ready.then(() => true)", awaitPromise: true });
    await sleep(SETTLE_MS);
    const { result } = await cdp.send("Runtime.evaluate", {
      expression: `JSON.stringify({ accent: document.documentElement.dataset.accent ?? "violet", dark: document.documentElement.classList.contains("dark") })`,
      returnByValue: true,
    });
    const state = JSON.parse(result.value);
    if (state.accent !== accent || state.dark !== (mode === "dark")) throw new Error(`Page shows ${JSON.stringify(state)}, expected ${accent} ${mode}.`);
    const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
    return Buffer.from(data, "base64");
  } finally {
    await cdp.send("Page.removeScriptToEvaluateOnNewDocument", { identifier });
  }
}

/** Writes `<stem>.webp` and `<stem>.avif`, each with a `.json` sidecar recording how it was made. */
async function encode(png, stem, what, createdAt) {
  const base = join(OUT_DIR, stem);
  await sharp(png).webp(WEBP).toFile(`${base}.webp`);
  await sharp(png).avif(AVIF).toFile(`${base}.avif`);
  const source = `Headless Chromium capture of the ShiftSentry demo dashboard (synthetic records from src/lib/dashboard-demo.ts, clock fixed at ${CLOCK}) by scripts/capture-dashboard.mjs, at ${what}, including the sample-data label.`;
  writeFileSync(`${base}.webp.json`, JSON.stringify({ prompt: `${source} WebP quality ${WEBP.quality}.`, createdAt }, null, 2) + "\n");
  writeFileSync(`${base}.avif.json`, JSON.stringify({ prompt: `${source} AVIF quality ${AVIF.quality}, effort ${AVIF.effort}, ${AVIF.chromaSubsampling} chroma subsampling.`, createdAt }, null, 2) + "\n");
}

/** Opens the DevTools websocket of the browser's first page. */
async function connect(userDataDir) {
  const portFile = join(userDataDir, "DevToolsActivePort");
  let target;
  for (let attempt = 0; attempt < 100 && !target; attempt++) {
    try {
      const port = readFileSync(portFile, "utf8").split("\n")[0].trim();
      target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((entry) => entry.type === "page");
    } catch { /* not up yet */ }
    if (!target) await sleep(200);
  }
  if (!target) throw new Error("The browser's DevTools endpoint never came up.");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener("open", resolve, { once: true }); ws.addEventListener("error", reject, { once: true }); });
  let id = 0;
  const pending = new Map();
  const waiters = new Map();
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject, method } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(`${method}: ${message.error.message}`));
      else resolve(message.result);
    } else if (message.method && waiters.has(message.method)) {
      const resolvers = waiters.get(message.method);
      waiters.delete(message.method);
      for (const resolve of resolvers) resolve(message.params);
    }
  });
  return {
    send: (method, params = {}) => new Promise((resolve, reject) => {
      const n = ++id;
      pending.set(n, { resolve, reject, method });
      ws.send(JSON.stringify({ id: n, method, params }));
    }),
    once: (method) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), 30_000);
      waiters.set(method, [...(waiters.get(method) ?? []), (params) => { clearTimeout(timer); resolve(params); }]);
    }),
    close: () => ws.close(),
  };
}

async function respond(url) {
  try { await fetch(url, { signal: AbortSignal.timeout(1500) }); return true; } catch { return false; }
}

async function waitForServer() {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (server.exitCode !== null) throw new Error(`next start exited with code ${server.exitCode}.`);
    try {
      const response = await fetch(BASE, { signal: AbortSignal.timeout(5000) });
      if (response.ok) return;
    } catch { /* still starting */ }
    await sleep(500);
  }
  throw new Error(`The demo server never answered on ${BASE}.`);
}

function run(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: ROOT, stdio: "inherit", ...options });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${args.slice(1).join(" ")} exited with code ${code}`))));
  });
}

/** Stops `next start` and anything it spawned (a plain kill leaves children behind on Windows). */
async function stop(child) {
  if (child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  if (process.platform === "win32") spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else child.kill("SIGTERM");
  await Promise.race([exited, sleep(5000)]);
}
