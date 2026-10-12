import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const inventory = [];
const packages = new Map();
const noticeDirectory = resolve("public/license-notices");
mkdirSync(noticeDirectory, { recursive: true });
function publishNotice(contents) {
  const payload = JSON.stringify(contents);
  const id = createHash("sha256").update(payload).digest("hex");
  writeFileSync(resolve(noticeDirectory, `${id}.json`), `${payload}\n`);
  return `/license-notices/${id}.json`;
}
const notices = ["ShiftSentry third-party software notices", "", "This file does not license ShiftSentry itself. Each dependency retains its own license.", "Inventory includes non-development lockfile entries; optional platform packages may not be installed in this build.", ""];
// Windows native packages do not include all of libvips' license texts. Retain
// the upstream notices and LGPL/GPL texts in every distributed artifact too.
for (const file of ["sharp-libvips-notices.md", "LGPL-3.0.txt", "GPL-3.0.txt", "provenance.txt"]) {
  notices.push(`=== Native library notice: ${file} ===`, readFileSync(resolve("docs/licenses", file), "utf8"), "");
}
for (const [path, item] of Object.entries(lock.packages).sort(([a], [b]) => a.localeCompare(b))) {
  if (!path || item.dev || !path.startsWith("node_modules/")) continue;
  const name = path.split("node_modules/").at(-1);
  const directory = resolve(path);
  const installed = existsSync(directory);
  const metadataPath = resolve(directory, "package.json");
  const metadata = existsSync(metadataPath) ? JSON.parse(readFileSync(metadataPath, "utf8")) : {};
  const repository = typeof metadata.repository === "string" ? metadata.repository : metadata.repository?.url;
  const source = repository?.replace(/^git\+/, "").replace(/\.git$/, "") ?? `https://www.npmjs.com/package/${name}/v/${item.version}`;
  // OneDrive can report hydrated license files as symbolic links. Follow
  // those file entries too; excluding them silently drops required notices.
  const files = installed ? readdirSync(directory, { withFileTypes: true }).filter((f) => /^(?:license|licence|copying|notice|third[ _-]party[ _-]notices|copyright)(?:[.-]|$)/i.test(f.name) && (f.isFile() || (f.isSymbolicLink() && statSync(resolve(directory, f.name)).isFile()))).map((f) => f.name).sort() : [];
  inventory.push({ name, version: item.version, license: item.license ?? metadata.license ?? "Review required", source, installed, noticeFiles: files });
  if (!installed) continue;
  const key = `${name}@${item.version}`;
  const entry = packages.get(key) ?? { name, version: item.version, license: item.license ?? metadata.license ?? "Review required", source: source.startsWith("https://") ? source : `https://www.npmjs.com/package/${name}/v/${item.version}`, texts: new Map() };
  for (const file of files) {
    const text = readFileSync(resolve(directory, file), "utf8");
    entry.texts.set(`${file}:${text}`, { title: file, text });
  }
  notices.push(`=== ${name} ${item.version} ===`, `License: ${item.license ?? metadata.license ?? "Review required"}`, `Source: ${source}`, "");
  for (const file of files) notices.push(`--- ${file} ---`, readFileSync(resolve(directory, file), "utf8"), "");
  // Native libvips distributions ship additional notices inside lib/.
  const nativeNotices = resolve(directory, "lib/third-party-notices.md");
  if (existsSync(nativeNotices)) {
    const text = readFileSync(nativeNotices, "utf8");
    notices.push(text, "");
    entry.texts.set(`native:${text}`, { title: "Bundled image-library notices", text });
  }
  const versionsPath = existsSync(resolve(directory, "versions.json")) ? resolve(directory, "versions.json") : resolve(directory, "lib/versions.json");
  if (name.startsWith("@img/sharp-") && existsSync(versionsPath)) {
    const versions = JSON.parse(readFileSync(versionsPath, "utf8"));
    if (versions.vips) notices.push(`Unmodified libvips source: https://github.com/libvips/libvips/tree/v${versions.vips}`);
    notices.push("Native build source and dependency recipes: https://github.com/lovell/sharp-libvips", "");
  }
  packages.set(key, entry);
}
writeFileSync("public/third-party-notices.txt", `${notices.join("\n")}\n`);
writeFileSync("public/dependency-license-inventory.json", `${JSON.stringify({ packages: inventory }, null, 2)}\n`);
const native = [
  { name: "Image processing libraries", license: "Multiple licenses", file: "sharp-libvips-notices.md" },
  { name: "GNU Lesser General Public License", license: "LGPL-3.0", file: "LGPL-3.0.txt" },
  { name: "GNU General Public License", license: "GPL-3.0", file: "GPL-3.0.txt" },
].map(({ name, license, file }) => {
  const text = readFileSync(resolve("docs/licenses", file), "utf8");
  const attributions = file === "sharp-libvips-notices.md" ? text.split(/\r?\n/).filter((line) => /^\|\s*[^-]/.test(line)).slice(1).map((line) => {
    const cells = line.split("|").map((cell) => cell.trim());
    return { name: cells[1], license: cells[2] };
  }) : undefined;
  const lines = text.split(/\r?\n/);
  const readableText = attributions ? lines.slice(lines.findLastIndex((line) => line.startsWith("|")) + 1).join("\n").trim() : text;
  return { name, license, noticeUrl: publishNotice([{ title: name, text: readableText, attributions }]) };
});
writeFileSync("public/license-catalog.json", `${JSON.stringify({
  packages: [...packages.values()].map(({ texts, ...entry }) => ({ ...entry, noticeUrl: publishNotice([...texts.values()]) })).sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version)),
  native,
}, null, 2)}\n`);
console.log(`Prepared notices for ${inventory.length} non-development dependency entries.`);
