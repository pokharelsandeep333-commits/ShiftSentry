import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeSessionProfile, encodeSessionProfile, type SessionProfile } from "./session-context";

const profile: SessionProfile = {
  id: "11111111-1111-1111-1111-111111111111", email: "sandeep@example.com", display_name: "Sändeep ✓", role: "ADMIN",
  time_zone: "America/Chicago", week_starts_on: 0, global_weekly_limit_minutes: 1200, disabled_at: null, deletion_pending_at: null,
};

test("round-trips a profile, including non-ASCII names, as an ASCII header value", () => {
  const value = encodeSessionProfile(profile);
  assert.match(value, /^[\x20-\x7e]+$/);
  assert.deepEqual(decodeSessionProfile(value, profile.id), profile);
});

test("refuses a profile for a different user", () => {
  assert.equal(decodeSessionProfile(encodeSessionProfile(profile), "22222222-2222-2222-2222-222222222222"), null);
});

test("refuses malformed or tampered values", () => {
  assert.equal(decodeSessionProfile(null, profile.id), null);
  assert.equal(decodeSessionProfile("%E0%A4%A", profile.id), null);
  assert.equal(decodeSessionProfile(encodeURIComponent("not json"), profile.id), null);
  assert.equal(decodeSessionProfile(encodeURIComponent(JSON.stringify({ ...profile, role: "OWNER" })), profile.id), null);
  assert.equal(decodeSessionProfile(encodeURIComponent(JSON.stringify({ ...profile, week_starts_on: "0" })), profile.id), null);
  assert.equal(decodeSessionProfile(encodeURIComponent(JSON.stringify({ id: profile.id })), profile.id), null);
});

test("drops anything beyond the known fields", () => {
  const decoded = decodeSessionProfile(encodeURIComponent(JSON.stringify({ ...profile, extra: "x" })), profile.id);
  assert.equal(decoded && "extra" in decoded, false);
});
