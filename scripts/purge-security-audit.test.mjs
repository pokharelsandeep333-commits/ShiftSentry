import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("malformed retention credentials cannot appear in workflow output", () => {
  const marker = "private-password-test-marker";
  const result = spawnSync(process.execPath, ["scripts/purge-security-audit.mjs"], { env: { ...process.env, SUPABASE_DB_URL: `not-a-url-${marker}` }, encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Retention cleanup failed/);
  assert.equal(`${result.stdout}${result.stderr}`.includes(marker), false);
});

test("retention refuses to run without the protected database credential", () => {
  const env = { ...process.env };
  delete env.SUPABASE_DB_URL;
  const result = spawnSync(process.execPath, ["scripts/purge-security-audit.mjs"], { env, encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /protected production database credential is required/);
});
