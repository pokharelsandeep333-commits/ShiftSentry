import assert from "node:assert/strict";
import test from "node:test";
import { publicRequestOrigin, safeInternalRedirect } from "./request-origin";

test("uses the public forwarded HTTPS origin behind a proxy", () => {
  const request = new Request("http://0.0.0.0:3000/auth/callback", {
    headers: {
      "x-forwarded-host": "sentry.sandeeppokharel.com.np",
      "x-forwarded-proto": "https",
    },
  });

  assert.equal(publicRequestOrigin(request), "https://sentry.sandeeppokharel.com.np");
});

test("keeps the direct request origin for local development", () => {
  assert.equal(publicRequestOrigin(new Request("http://localhost:3000/auth/callback")), "http://localhost:3000");
});

test("rejects malformed forwarded hosts", () => {
  const request = new Request("http://localhost:3000/auth/callback", {
    headers: { "x-forwarded-host": "sentry.sandeeppokharel.com.np/untrusted" },
  });

  assert.equal(publicRequestOrigin(request), "http://localhost:3000");
});

test("accepts only origin-relative post-auth redirects", () => {
  assert.equal(safeInternalRedirect("/shifts?view=week#today"), "/shifts?view=week#today");
  assert.equal(safeInternalRedirect("//attacker.example"), "/");
  assert.equal(safeInternalRedirect("/\\attacker.example"), "/");
  assert.equal(safeInternalRedirect("https://attacker.example"), "/");
});

test("refuses paths that normalize to a protocol-relative URL", () => {
  // Each of these passed the origin check before and came back as "//evil.com".
  assert.equal(safeInternalRedirect("https://internal.invalid//attacker.example"), "/");
  assert.equal(safeInternalRedirect("/.//attacker.example"), "/");
  assert.equal(safeInternalRedirect("/..//attacker.example"), "/");
  assert.equal(safeInternalRedirect("/./\t/attacker.example"), "/");
  assert.equal(safeInternalRedirect("/.\\/attacker.example"), "/");
  assert.equal(safeInternalRedirect("\\\\attacker.example"), "/");
  assert.equal(safeInternalRedirect("game/ABC123"), "/");
});

test("keeps ordinary in-app paths intact", () => {
  assert.equal(safeInternalRedirect("/game/ABC123"), "/game/ABC123");
  assert.equal(safeInternalRedirect("/shifts/../jobs"), "/jobs");
  assert.equal(safeInternalRedirect(null), "/");
  assert.equal(safeInternalRedirect("", "/shifts"), "/shifts");
});
