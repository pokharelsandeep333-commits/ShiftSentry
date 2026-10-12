import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Run only when preparing a NEW, unapplied legal migration. Applied migrations
// and prior version JSON files are immutable. --check is the CI/read-only mode.
const version = JSON.parse(readFileSync("src/lib/legal/versions/2026-10-11.1.json", "utf8"));
const migration = resolve("supabase/migrations/20261012002439_legal_account_privacy.sql");
const text = readFileSync(migration, "utf8").replace(/\r\n/g, "\n");
const start = "-- BEGIN LEGAL SNAPSHOT";
const end = "-- END LEGAL SNAPSHOT";
const snapshot = `${start}\ninsert into public.legal_versions(version, minimum_age, documents) values ('${version.version}', ${version.minimumAge}, $legal$${JSON.stringify(version)}$legal$::jsonb);\n${end}`;
if (process.argv.includes("--check")) {
  if (!text.includes(snapshot)) throw new Error("The immutable legal snapshot differs from the rendered documents.");
  console.log("Legal document snapshot matches the database migration.");
} else {
  if (text.includes(start)) throw new Error("Snapshot already exists. Create a new version and migration rather than rewriting it.");
  writeFileSync(migration, text.replace("-- LEGAL_SNAPSHOT: inserted by scripts/snapshot-legal.mjs from the same JSON the pages render.", snapshot));
}
