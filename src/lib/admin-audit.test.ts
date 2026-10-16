import assert from "node:assert/strict";
import test from "node:test";
import { auditActionLabel, auditHref, csvCell, csvRow, describeAuditEvent, readAuditFilters } from "./admin-audit";

test("labels known actions and passes unknown codes through", () => {
  assert.equal(auditActionLabel("account.disabled"), "Account disabled");
  assert.equal(auditActionLabel("something.new"), "something.new");
});

test("describes an event with its actor and target", () => {
  assert.equal(describeAuditEvent("account.disabled", "ava@x.test", "sam@y.test"), "ava@x.test disabled sam@y.test");
  assert.equal(describeAuditEvent("audit.exported", "ava@x.test", null), "ava@x.test downloaded the audit log");
  assert.equal(describeAuditEvent("account.enabled", null, "sam@y.test"), "System enabled sam@y.test");
  assert.equal(describeAuditEvent("something.new", "ava@x.test", "sam@y.test"), "ava@x.test: something.new (sam@y.test)");
});

test("quotes every cell and doubles embedded quotes", () => {
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell(null), '""');
  assert.equal(csvCell(3), '"3"');
  assert.equal(csvRow(["a", "b,c"]), '"a","b,c"');
});

test("defuses cells a spreadsheet would run as a formula", () => {
  for (const attack of ["=HYPERLINK(\"x\")", "+1", "-2", "@SUM(A1)", "\tx", "\rx"]) {
    assert.ok(csvCell(attack).startsWith("\"'"), attack);
  }
  assert.equal(csvCell("plain"), '"plain"');
});

test("reads audit filters, dropping anything it does not recognise", () => {
  const params = new URLSearchParams({ action: "account.disabled", actor: "11111111-1111-4111-8111-111111111111", target: " sam ", days: "7", page: "2" });
  assert.deepEqual(readAuditFilters((name) => params.get(name)), { action: "account.disabled", actor: "11111111-1111-4111-8111-111111111111", target: "sam", days: 7, page: 2 });
  assert.equal(readAuditFilters((name) => (name === "action" ? "toString" : null)).action, "");
  const junk = new URLSearchParams({ action: "drop table", actor: "not-a-uuid", days: "365", page: "0" });
  assert.deepEqual(readAuditFilters((name) => junk.get(name)), { action: "", actor: "", target: "", days: 30, page: 1 });
});

test("builds audit URLs without defaults", () => {
  const filters = readAuditFilters(() => null);
  assert.equal(auditHref(filters, {}), "/admin/audit");
  assert.equal(auditHref(filters, { action: "account.enabled", days: 7 }), "/admin/audit?action=account.enabled&days=7");
});
