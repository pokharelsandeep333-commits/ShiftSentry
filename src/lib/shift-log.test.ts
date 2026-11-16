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

test("weekShape files each shift under the local day it starts on", async () => {
  const { formatInTimeZone } = await import("date-fns-tz");
  const { weekShape } = await import("./shift-log");
  const zone = "America/Chicago";
  const day = (instant: Date, timeZone: string) => formatInTimeZone(instant, timeZone, "yyyy-MM-dd");
  // Sunday Nov 1 2026, local midnight; the clocks fall back that morning.
  const start = new Date("2026-11-01T05:00:00.000Z");
  const shape = weekShape(start, [
    { startsAt: "2026-11-03T14:00:00.000Z", endsAt: "2026-11-03T16:30:00.000Z", color: "#9486ff", upcoming: false },
    { startsAt: "2026-11-03T20:00:00.000Z", endsAt: "2026-11-03T22:00:00.000Z", color: "#9486ff", upcoming: false },
    { startsAt: "2026-11-03T23:00:00.000Z", endsAt: "2026-11-04T00:00:00.000Z", color: "#32d583", upcoming: true },
    // 11 PM Saturday local, running into Sunday: stays on Saturday.
    { startsAt: "2026-11-08T05:00:00.000Z", endsAt: "2026-11-08T09:00:00.000Z", color: "#32d583", upcoming: true },
    // Outside the week: ignored.
    { startsAt: "2026-11-09T15:00:00.000Z", endsAt: "2026-11-09T16:00:00.000Z", color: "#32d583", upcoming: true },
  ], zone, day);
  assert.deepEqual(shape.map((d) => d.date), ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07"]);
  assert.equal(shape[2].minutes, 330);
  assert.deepEqual(shape[2].segments, [{ color: "#9486ff", minutes: 270, upcoming: false }, { color: "#32d583", minutes: 60, upcoming: true }]);
  assert.equal(shape[6].minutes, 240);
  assert.equal(shape[0].minutes, 0);
});

test("dayFill and railPosition stay inside their tracks", async () => {
  const { dayFill, railPosition } = await import("./shift-log");
  assert.equal(dayFill(300), 50);
  assert.equal(dayFill(900), 100);
  assert.deepEqual(railPosition(8 * 60, 150), { left: (480 / 1440) * 100, width: (150 / 1440) * 100, continues: false });
  const overnight = railPosition(22 * 60, 6 * 60);
  assert.ok(Math.abs(overnight.left + overnight.width - 100) < 1e-9);
  assert.equal(overnight.continues, true);
  assert.deepEqual(railPosition(-5, -10), { left: 0, width: 0, continues: false });
});
