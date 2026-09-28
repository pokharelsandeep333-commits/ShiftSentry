import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { readGoogleCalendarConfig } from "./config";

const complete = {
  GOOGLE_CALENDAR_ENABLED: "true",
  GOOGLE_OAUTH_CLIENT_ID: "id.apps.googleusercontent.com",
  GOOGLE_OAUTH_CLIENT_SECRET: "secret",
  GOOGLE_TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
};

test("is on only when the flag is exactly true and every value is present", () => {
  assert.ok(readGoogleCalendarConfig(complete));
  assert.equal(readGoogleCalendarConfig({ ...complete, GOOGLE_CALENDAR_ENABLED: "1" }), null);
  assert.equal(readGoogleCalendarConfig({ ...complete, GOOGLE_CALENDAR_ENABLED: undefined }), null);
  assert.equal(readGoogleCalendarConfig({ ...complete, GOOGLE_OAUTH_CLIENT_SECRET: "" }), null);
});

test("treats a malformed key as off rather than crashing a page", () => {
  assert.equal(readGoogleCalendarConfig({ ...complete, GOOGLE_TOKEN_ENCRYPTION_KEY: "short" }), null);
});
