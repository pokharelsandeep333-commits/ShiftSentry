import assert from "node:assert/strict";
import test from "node:test";
import { createRateLimiter } from "./rate-limit";

test("allows up to the limit per key inside the window, then refuses", () => {
  const allow = createRateLimiter({ limit: 2, windowMs: 1_000 });
  assert.equal(allow("a", 0), true);
  assert.equal(allow("a", 10), true);
  assert.equal(allow("a", 20), false);
  assert.equal(allow("b", 20), true);
});

test("frees a slot once the oldest hit leaves the window", () => {
  const allow = createRateLimiter({ limit: 1, windowMs: 1_000 });
  assert.equal(allow("a", 0), true);
  assert.equal(allow("a", 999), false);
  assert.equal(allow("a", 1_000), true);
});
