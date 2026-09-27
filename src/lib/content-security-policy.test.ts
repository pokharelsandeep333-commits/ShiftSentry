import assert from "node:assert/strict";
import test from "node:test";
import { contentSecurityPolicy, createNonce } from "./content-security-policy";

const SUPABASE_URL = "https://abcdefghijklmnop.supabase.co";

function directive(policy: string, name: string) {
  return policy.split("; ").find((entry) => entry.startsWith(`${name} `));
}

test("allows scripts by nonce, never by 'unsafe-inline'", () => {
  const policy = contentSecurityPolicy({ nonce: "abc123", supabaseUrl: SUPABASE_URL, development: false });
  assert.equal(directive(policy, "script-src"), "script-src 'self' 'nonce-abc123' 'strict-dynamic'");
});

test("the nonce-less fallback allows no inline script at all", () => {
  const policy = contentSecurityPolicy({ supabaseUrl: SUPABASE_URL, development: false });
  assert.equal(directive(policy, "script-src"), "script-src 'self'");
});

test("only development gets 'unsafe-eval'", () => {
  assert.match(directive(contentSecurityPolicy({ nonce: "n", development: true }), "script-src") ?? "", /'unsafe-eval'/);
  assert.doesNotMatch(directive(contentSecurityPolicy({ nonce: "n", development: false }), "script-src") ?? "", /'unsafe-eval'/);
});

test("names worker-src so 'strict-dynamic' does not refuse the service worker", () => {
  assert.equal(directive(contentSecurityPolicy({ nonce: "n", development: false }), "worker-src"), "worker-src 'self'");
});

test("pins connect-src to the project's own origin and socket, not *.supabase.co", () => {
  const policy = contentSecurityPolicy({ nonce: "n", supabaseUrl: SUPABASE_URL, development: false });
  assert.equal(directive(policy, "connect-src"), "connect-src 'self' https://abcdefghijklmnop.supabase.co wss://abcdefghijklmnop.supabase.co");
  assert.doesNotMatch(policy, /\*/);
});

test("connect-src falls back to 'self' when Supabase is absent or malformed", () => {
  for (const supabaseUrl of [undefined, "", "not a url", "javascript:alert(1)"]) {
    assert.equal(directive(contentSecurityPolicy({ nonce: "n", supabaseUrl, development: false }), "connect-src"), "connect-src 'self'");
  }
});

test("keeps the framing, base and form locks", () => {
  const policy = contentSecurityPolicy({ nonce: "n", development: false });
  for (const rule of ["frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "object-src 'none'"]) assert.ok(policy.includes(rule), rule);
});

test("nonces are fresh and base64", () => {
  const nonces = new Set(Array.from({ length: 50 }, createNonce));
  assert.equal(nonces.size, 50);
  for (const nonce of nonces) assert.match(nonce, /^[A-Za-z0-9+/]+=*$/);
});
