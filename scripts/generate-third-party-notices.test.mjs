import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

test("linked license files appear in the complete download and deduplicated catalog", (context) => {
  const fixture = mkdtempSync(join(tmpdir(), "shiftsentry-license-test-"));
  const generator = fileURLToPath(new URL("./generate-third-party-notices.mjs", import.meta.url));
  try {
    const first = join(fixture, "node_modules/example-library");
    const second = join(fixture, "node_modules/parent/node_modules/example-library");
    for (const folder of [first, second]) {
      mkdirSync(folder, { recursive: true });
      writeFileSync(join(folder, "package.json"), JSON.stringify({ name: "example-library", version: "1.0.0", license: "MIT" }));
      writeFileSync(join(folder, "upstream.txt"), "Copyright Example Authors. Keep this permission notice.");
      try { symlinkSync(join(folder, "upstream.txt"), join(folder, "LICENSE"), "file"); }
      catch (error) {
        if (error.code === "EPERM") { context.skip("Creating fixture symlinks requires Windows Developer Mode; CI verifies this regression."); return; }
        throw error;
      }
    }
    mkdirSync(join(fixture, "public"));
    mkdirSync(join(fixture, "docs/licenses"), { recursive: true });
    for (const file of ["sharp-libvips-notices.md", "LGPL-3.0.txt", "GPL-3.0.txt", "provenance.txt"]) writeFileSync(join(fixture, "docs/licenses", file), `Fixture ${file}`);
    writeFileSync(join(fixture, "package-lock.json"), JSON.stringify({ packages: {
      "": {},
      "node_modules/example-library": { version: "1.0.0", license: "MIT" },
      "node_modules/parent/node_modules/example-library": { version: "1.0.0", license: "MIT" },
      "node_modules/optional-platform": { version: "1.0.0", optional: true },
    } }));
    const generated = spawnSync(process.execPath, [generator], { cwd: fixture, encoding: "utf8" });
    assert.equal(generated.status, 0, generated.stderr);
    const catalog = JSON.parse(readFileSync(join(fixture, "public/license-catalog.json"), "utf8"));
    assert.equal(catalog.packages.length, 1, "same name/version is displayed once; absent platform packages are omitted");
    const notices = JSON.parse(readFileSync(join(fixture, "public", catalog.packages[0].noticeUrl), "utf8"));
    assert.equal(notices.length, 1, "identical bundled texts are deduplicated for display");
    assert.equal(notices[0].text, "Copyright Example Authors. Keep this permission notice.");
    assert.ok(readFileSync(join(fixture, "public/third-party-notices.txt"), "utf8").includes(notices[0].text));
  } finally {
    const target = realpathSync(fixture);
    assert.ok(target.startsWith(realpathSync(tmpdir()) + sep) && dirname(resolve(target)).length > 3);
    rmSync(target, { recursive: true, force: true });
  }
});
