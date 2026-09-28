import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { findClashes, type CalendarEvent } from "./calendar-clash";
import { addLocalDays } from "./calendar-range";
import { matchEventsToShifts, suggestJob, type MatchJob } from "./shift-match";

/**
 * Shifts and Google events as one kind of item for the calendar page, and where
 * each timed item sits in a day column. Positions are wall-clock minutes in the
 * viewer's zone, clipped to that day, so an overnight shift appears on both
 * days it touches. Overlapping items are split into lanes; back-to-back ones
 * are not overlapping (half-open, like the clash rule).
 */
export type CalendarShiftInput = { id: string; jobName: string; color: string; startsAt: string; endsAt: string };
export type CalendarItem = {
  key: string; kind: "shift" | "event"; title: string; startsAt: string; endsAt: string; allDay: boolean; color: string; href: string | null; overlap: boolean;
  /** A shift that also sits in Google Calendar; its copy is merged in rather than drawn twice. */
  alsoInGoogle: boolean;
  /** An event that looks like one of the viewer's jobs and has no shift yet: where "Add as shift" goes. */
  importHref: string | null; importJob: string | null;
};
export type PlacedItem = { item: CalendarItem; top: number; height: number; lane: number; lanes: number };

/**
 * A Google event that is a copy of one of the shifts (see shift-match.ts) is
 * folded into that shift: drawn once, and never a clash with itself. What is
 * left is compared for clashes, and an event named for a job with no shift yet
 * links to Add shift prefilled with that job and its times.
 */
export function buildCalendarItems(shifts: CalendarShiftInput[], events: CalendarEvent[], colors: Map<string, string>, options: { jobs?: MatchJob[]; timeZone?: string } = {}): CalendarItem[] {
  const visibleEvents = events.filter((event) => !event.declined);
  const matches = matchEventsToShifts(visibleEvents, shifts);
  const copied = new Set(matches.values());
  const otherEvents = visibleEvents.filter((event) => !matches.has(`${event.calendarId}:${event.id}`));
  const local = (iso: string) => formatInTimeZone(iso, options.timeZone ?? "UTC", "yyyy-MM-dd'T'HH:mm");

  const shiftItems = shifts.map((shift): CalendarItem => ({
    key: `shift:${shift.id}`, kind: "shift", title: shift.jobName, startsAt: shift.startsAt, endsAt: shift.endsAt, allDay: false,
    color: shift.color, href: `/shifts/${shift.id}/edit`, overlap: findClashes(shift, otherEvents).length > 0,
    alsoInGoogle: copied.has(shift.id), importHref: null, importJob: null,
  }));
  const eventItems = otherEvents.map((event): CalendarItem => {
    const job = options.jobs && options.timeZone ? suggestJob(event, options.jobs) : null;
    return {
      key: `event:${event.calendarId}:${event.id}`, kind: "event", title: event.title, startsAt: event.startsAt, endsAt: event.endsAt, allDay: event.allDay,
      color: colors.get(event.calendarId) ?? "#9486ff", href: null,
      overlap: shifts.some((shift) => findClashes(shift, [event]).length > 0),
      alsoInGoogle: false,
      importHref: job ? `/shifts/new?${new URLSearchParams({ jobId: job.id, startsAt: local(event.startsAt), endsAt: local(event.endsAt) }).toString()}` : null,
      importJob: job?.name ?? null,
    };
  });
  return [...shiftItems, ...eventItems];
}

function wallMinutes(instant: number, timeZone: string) {
  const [hours, minutes] = formatInTimeZone(instant, timeZone, "H:m").split(":").map(Number);
  return hours * 60 + minutes;
}

function dayBounds(day: string, timeZone: string) {
  return { start: fromZonedTime(`${day}T00:00:00`, timeZone).getTime(), end: fromZonedTime(`${addLocalDays(day, 1)}T00:00:00`, timeZone).getTime() };
}

export function itemsOnDay(items: CalendarItem[], day: string, timeZone: string) {
  const { start, end } = dayBounds(day, timeZone);
  return items
    .filter((item) => Date.parse(item.startsAt) < end && Date.parse(item.endsAt) > start)
    .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.startsAt.localeCompare(b.startsAt));
}

export function layoutDay(items: CalendarItem[], day: string, timeZone: string): PlacedItem[] {
  const { start, end } = dayBounds(day, timeZone);
  const timed = itemsOnDay(items, day, timeZone).filter((item) => !item.allDay).map((item) => {
    const from = Math.max(Date.parse(item.startsAt), start);
    const to = Math.min(Date.parse(item.endsAt), end);
    // Wall-clock minutes, not elapsed ones: the grid's hour rows are wall-clock,
    // and on a daylight-saving day elapsed time runs an hour ahead of or behind
    // them. A repeated or skipped hour can squeeze an item; it keeps a sliver.
    const top = from === start ? 0 : wallMinutes(from, timeZone);
    const bottom = to === end ? 24 * 60 : wallMinutes(to, timeZone);
    return { item, from, to, top, height: Math.max(bottom - top, 5), lane: 0, lanes: 1 };
  }).sort((a, b) => a.from - b.from || b.to - a.to);

  // Items that overlap, directly or through a chain, form a cluster; each takes
  // the first lane that is free by its start, and the cluster shares the width.
  let cluster: typeof timed = [];
  let clusterEnd = -Infinity;
  const laneEnds: number[] = [];
  const close = () => { for (const placed of cluster) placed.lanes = laneEnds.length; cluster = []; laneEnds.length = 0; };
  for (const placed of timed) {
    if (placed.from >= clusterEnd) close();
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= placed.from);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(placed.to); } else laneEnds[lane] = placed.to;
    placed.lane = lane;
    cluster.push(placed);
    clusterEnd = Math.max(clusterEnd, placed.to);
  }
  close();
  return timed.map(({ item, top, height, lane, lanes }) => ({ item, top, height, lane, lanes }));
}
