import assert from "node:assert/strict";
import { test } from "node:test";
import { adminsToRevoke, isAllowlisted, parseAdminAllowlist } from "./admin-allowlist";

test("parses a comma list, trimmed and case-insensitive", () => {
  const list = parseAdminAllowlist(" Owner@Example.com, second@example.com ,,");
  assert.equal(list.size, 2);
  assert.equal(isAllowlisted("owner@example.com", list), true);
  assert.equal(isAllowlisted("SECOND@EXAMPLE.COM ", list), true);
  assert.equal(isAllowlisted("other@example.com", list), false);
});

test("an empty or missing list admits nobody", () => {
  assert.equal(parseAdminAllowlist(undefined).size, 0);
  assert.equal(parseAdminAllowlist("").size, 0);
  assert.equal(isAllowlisted("owner@example.com", parseAdminAllowlist(undefined)), false);
  assert.equal(isAllowlisted(null, parseAdminAllowlist("owner@example.com")), false);
});

test("an admin removed from the list is revoked, a listed one is kept", () => {
  const list = parseAdminAllowlist("owner@example.com");
  const revoked = adminsToRevoke([{ id: "a", email: "Owner@example.com" }, { id: "b", email: "former@example.com" }, { id: "c", email: null }], list);
  assert.deepEqual(revoked.map((admin) => admin.id), ["b", "c"]);
});
