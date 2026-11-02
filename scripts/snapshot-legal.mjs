import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Every published legal version and the migration that snapshots it. Applied
// migrations and their JSON files are immutable: publishing a new version adds
// a pair, it never edits one. Run without flags only when preparing a NEW,
// unapplied legal migration; --check is the CI/read-only mode.
const PAIRS = [
  ["2026-10-11.1", "20261012002439_legal_account_privacy.sql"],
  ["2026-11-02.1", "20261102120000_legal_hosting_update.sql"],
];
const start = "-- BEGIN LEGAL SNAPSHOT";
const end = "-- END LEGAL SNAPSHOT";
const placeholder = "-- LEGAL_SNAPSHOT: inserted by scripts/snapshot-legal.mjs from the same JSON the pages render.";

for (const [id, file] of PAIRS) {
  const version = JSON.parse(readFileSync(`src/lib/legal/versions/${id}.json`, "utf8"));
  if (version.version !== id) throw new Error(`${id}.json declares version ${version.version}.`);
  const migration = resolve("supabase/migrations", file);
  const text = readFileSync(migration, "utf8").replace(/\r\n/g, "\n");
  const snapshot = `${start}\ninsert into public.legal_versions(version, minimum_age, documents) values ('${version.version}', ${version.minimumAge}, $legal$${JSON.stringify(version)}$legal$::jsonb);\n${end}`;
  if (process.argv.includes("--check")) {
    if (!text.includes(snapshot)) throw new Error(`The immutable legal snapshot for ${id} differs from the rendered documents.`);
  } else if (!text.includes(start)) {
    if (!text.includes(placeholder)) throw new Error(`${file} has neither a snapshot nor the placeholder line.`);
    writeFileSync(migration, text.replace(placeholder, snapshot));
    console.log(`Wrote the ${id} snapshot into ${file}.`);
  }
}
if (process.argv.includes("--check")) console.log("Legal document snapshots match the database migrations.");
