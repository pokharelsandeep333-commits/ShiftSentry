// Renders the landing page's 3D art (scripts/welcome-3d/scene.html) to
// transparent webp in public/welcome/. Run by hand when the art changes:
//
//   node scripts/render-welcome-3d.mjs
//
// It serves the scene folder on localhost, drives headless Edge or Chrome over
// the DevTools protocol, renders each scene at 2x over white and over black,
// and recovers alpha from the difference (alpha = 1 - (white - black)), which
// is what keeps glass transmission and soft shadows correct on any background.
// Set BROWSER to a Chromium binary if neither default path exists.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = dirname(fileURLToPath(import.meta.url));
const sceneDir = join(root, "welcome-3d");
const outDir = join(root, "..", "public", "welcome");
const SCENES = [
  { name: "hero-3d", scene: "hero", width: 1400, height: 1400 },
  { name: "cta-3d", scene: "cta", width: 1200, height: 1000 },
];
const SUPERSAMPLE = 2;

const browserPath = [
  process.env.BROWSER,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find((candidate) => candidate && existsSync(candidate));
if (!browserPath) throw new Error("No Chromium browser found; set BROWSER.");

const server = createServer((request, response) => {
  const path = new URL(request.url ?? "/", "http://localhost").pathname;
  if (path !== "/scene.html") { response.writeHead(404).end(); return; }
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(readFileSync(join(sceneDir, "scene.html")));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const serverPort = server.address().port;

const debugPort = 9400 + Math.floor(Math.random() * 400);
const browser = spawn(browserPath, [
  "--headless=new", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "welcome-3d-"))}`,
  "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader", "--no-first-run", "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

try {
  let targets;
  for (let attempt = 0; attempt < 60 && !targets; attempt++) {
    try { targets = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json(); } catch { await sleep(250); }
  }
  const socket = new WebSocket(targets.find((target) => target.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve) => socket.addEventListener("open", resolve, { once: true }));
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
  });
  const send = (method, params = {}) => new Promise((resolve) => { const id = ++nextId; pending.set(id, resolve); socket.send(JSON.stringify({ id, method, params })); });
  const evaluate = async (expression) => {
    const { result } = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? "evaluate failed");
    return result.result.value;
  };

  for (const { name, scene, width, height } of SCENES) {
    const w = width * SUPERSAMPLE;
    const h = height * SUPERSAMPLE;
    await send("Page.navigate", { url: `http://127.0.0.1:${serverPort}/scene.html?scene=${scene}&w=${w}&h=${h}` });
    for (let attempt = 0; attempt < 240 && !(await evaluate("window.__ready === true")); attempt++) await sleep(250);
    const overWhite = await rawPixels(await evaluate(`window.__capture("#ffffff")`));
    const overBlack = await rawPixels(await evaluate(`window.__capture("#000000")`));
    const out = Buffer.alloc(w * h * 4);
    for (let pixel = 0; pixel < w * h; pixel++) {
      const i = pixel * 3;
      const difference = Math.max(overWhite[i] - overBlack[i], overWhite[i + 1] - overBlack[i + 1], overWhite[i + 2] - overBlack[i + 2]);
      const alpha = Math.min(255, Math.max(0, 255 - difference));
      const o = pixel * 4;
      for (let channel = 0; channel < 3; channel++) out[o + channel] = alpha === 0 ? 0 : Math.min(255, Math.round((overBlack[i + channel] * 255) / alpha));
      out[o + 3] = alpha;
    }
    const file = join(outDir, `${name}.webp`);
    await sharp(out, { raw: { width: w, height: h, channels: 4 } }).resize(width, height, { kernel: "lanczos3" }).webp({ quality: 86, alphaQuality: 90, effort: 6 }).toFile(file);
    console.log(`wrote ${file}`);
  }
  socket.close();
} finally {
  browser.kill();
  server.close();
}

async function rawPixels(dataUrl) {
  const png = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
  return sharp(png).removeAlpha().raw().toBuffer();
}
