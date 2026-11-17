import assert from "node:assert/strict";
import test from "node:test";
import { WEEKS_PER_PAGE, clampWeeks, isFiltered, readShiftFilters, shiftLogHref } from "./shift-log";

const job = "11111111-2222-4333-8444-555555555555";

test("reads filters and drops anything unrecognised", () => {
  const params = new URLSearchParams({ show: "upcoming", job });
  assert.deepEqual(readShiftFilters((name) => params.get(name)), { show: "upcoming", job });
  assert.deepEqual(readShiftFilters((name) => ({ show: "everything", job: "'; drop table" } as Record<string, string>)[name]), { show: "all", job: "" });
  assert.deepEqual(readShiftFilters(() => undefined), { show: "all", job: "" });
  assert.equal(readShiftFilters((name) => (name === "show" ? ["worked", "all"] : null)).show, "worked");
});

test("knows when a view is filtered", () => {
  assert.equal(isFiltered({ show: "all", job: "" }), false);
  assert.equal(isFiltered({ show: "worked", job: "" }), true);
  assert.equal(isFiltered({ show: "all", job }), true);
});

test("builds log addresses without defaults and keeps filters through a redirect", () => {
  assert.equal(shiftLogHref(WEEKS_PER_PAGE, { show: "all", job: "" }), "/shifts");
  assert.equal(shiftLogHref(16, { show: "upcoming", job }), `/shifts?weeks=16&show=upcoming&job=${job}`);
  assert.equal(shiftLogHref(clampWeeks("8"), { show: "worked", job: "" }, { saved: "shift-deleted" }), "/shifts?show=worked&saved=shift-deleted");
});
