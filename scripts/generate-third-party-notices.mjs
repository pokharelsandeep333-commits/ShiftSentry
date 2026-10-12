import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const inventory = [];
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
  const files = installed ? readdirSync(directory, { withFileTypes: true }).filter((f) => f.isFile() && /^(?:license|licence|copying|notice|third[ _-]party[ _-]notices|copyright)(?:[.-]|$)/i.test(f.name)).map((f) => f.name).sort() : [];
  inventory.push({ name, version: item.version, license: item.license ?? metadata.license ?? "Review required", source, installed, noticeFiles: files });
  if (!installed) continue;
  notices.push(`=== ${name} ${item.version} ===`, `License: ${item.license ?? metadata.license ?? "Review required"}`, `Source: ${source}`, "");
  for (const file of files) notices.push(`--- ${file} ---`, readFileSync(resolve(directory, file), "utf8"), "");
  // Native libvips distributions ship additional notices inside lib/.
  const nativeNotices = resolve(directory, "lib/third-party-notices.md");
  if (existsSync(nativeNotices)) notices.push(readFileSync(nativeNotices, "utf8"), "");
  const versionsPath = existsSync(resolve(directory, "versions.json")) ? resolve(directory, "versions.json") : resolve(directory, "lib/versions.json");
  if (name.startsWith("@img/sharp-") && existsSync(versionsPath)) {
    const versions = JSON.parse(readFileSync(versionsPath, "utf8"));
    if (versions.vips) notices.push(`Unmodified libvips source: https://github.com/libvips/libvips/tree/v${versions.vips}`);
    notices.push("Native build source and dependency recipes: https://github.com/lovell/sharp-libvips", "");
  }
}
writeFileSync("public/third-party-notices.txt", `${notices.join("\n")}\n`);
writeFileSync("public/dependency-license-inventory.json", `${JSON.stringify({ packages: inventory }, null, 2)}\n`);
console.log(`Prepared notices for ${inventory.length} non-development dependency entries.`);
