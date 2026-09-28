import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { REQUIRED_CALENDAR_SCOPES, buildAuthorizationUrl, createPkcePair, decodeOAuthCookie, encodeOAuthCookie, googleRedirectUri, hasRequiredScopes, readIdTokenEmail, statesMatch } from "./oauth";
import { classifyTokenError } from "./client";

test("PKCE challenge is the S256 of the verifier, base64url", () => {
  const { verifier, challenge } = createPkcePair();
  assert.match(verifier, /^[A-Za-z0-9_-]{43,128}$/);
  assert.equal(challenge, createHash("sha256").update(verifier).digest("base64url"));
});

test("authorization URL asks for offline, read-only access with PKCE", () => {
  const url = new URL(buildAuthorizationUrl({ clientId: "cid", redirectUri: googleRedirectUri("https://sentry.example"), state: "st", challenge: "ch" }));
  assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(url.searchParams.get("client_id"), "cid");
  assert.equal(url.searchParams.get("redirect_uri"), "https://sentry.example/integrations/google/callback");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.equal(url.searchParams.get("prompt"), "consent");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("code_challenge"), "ch");
  assert.equal(url.searchParams.get("state"), "st");
  const scopes = url.searchParams.get("scope")?.split(" ") ?? [];
  for (const scope of REQUIRED_CALENDAR_SCOPES) assert.ok(scopes.includes(scope));
  assert.ok(scopes.every((scope) => !/auth\/calendar(\.events)?$/.test(scope)), "never a read-write calendar scope");
});

test("requires both calendar scopes to have been granted", () => {
  assert.equal(hasRequiredScopes(REQUIRED_CALENDAR_SCOPES.join(" ")), true);
  assert.equal(hasRequiredScopes(`openid email ${REQUIRED_CALENDAR_SCOPES[0]}`), false);
  assert.equal(hasRequiredScopes(undefined), false);
});

test("reads the email from an ID token payload, or null", () => {
  const payload = Buffer.from(JSON.stringify({ email: "a@gmail.com", email_verified: true })).toString("base64url");
  assert.equal(readIdTokenEmail(`h.${payload}.s`), "a@gmail.com");
  assert.equal(readIdTokenEmail("garbage"), null);
  assert.equal(readIdTokenEmail(undefined), null);
});

test("cookie round-trips and rejects junk", () => {
  const value = { state: "s", verifier: "v", userId: "u" };
  assert.deepEqual(decodeOAuthCookie(encodeOAuthCookie(value)), value);
  assert.equal(decodeOAuthCookie("not-base64-json"), null);
  assert.equal(decodeOAuthCookie(undefined), null);
});

test("state comparison", () => {
  assert.equal(statesMatch("abc", "abc"), true);
  assert.equal(statesMatch("abc", "abd"), false);
  assert.equal(statesMatch("abc", "abcd"), false);
});

test("an invalid_grant from the token endpoint means reconnect; anything else is transient", () => {
  assert.equal(classifyTokenError(400, { error: "invalid_grant" }), "invalid_grant");
  assert.equal(classifyTokenError(400, { error: "invalid_request" }), "other");
  assert.equal(classifyTokenError(503, null), "other");
});
