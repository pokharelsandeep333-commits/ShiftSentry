import assert from "node:assert/strict";
import test from "node:test";
import { readUserFilters, usersHref } from "./admin-users";

test("falls back to the defaults for anything unrecognised", () => {
  assert.deepEqual(readUserFilters({ status: "banned", role: "root", page: "-3", q: "  ava  " }), { q: "ava", status: "all", role: "all", page: 1 });
  assert.deepEqual(readUserFilters({ status: ["disabled", "x"], role: "admin", page: "2" }), { q: "", status: "disabled", role: "admin", page: 2 });
});

test("caps the search length and the page number", () => {
  const filters = readUserFilters({ q: "x".repeat(500), page: "99999999" });
  assert.equal(filters.q.length, 100);
  assert.equal(filters.page, 10_000);
});

test("builds list URLs that drop defaults and reset the page on a filter change", () => {
  const filters = readUserFilters({ q: "ava", status: "disabled", page: "3" });
  assert.equal(usersHref(filters, { role: "admin" }), "/admin/users?q=ava&status=disabled&role=admin");
  assert.equal(usersHref(filters, { page: 4 }), "/admin/users?q=ava&status=disabled&page=4");
  assert.equal(usersHref(readUserFilters({}), {}), "/admin/users");
});
