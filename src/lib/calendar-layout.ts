import { fromZonedTime } from "date-fns-tz";
import { findClashes, type CalendarEvent } from "./calendar-clash";
import { addLocalDays } from "./calendar-range";

/**
 * Shifts and Google events as one kind of item for the calendar page, and where
 * each timed item sits in a day column. Positions are minutes from the viewer's
 * local midnight, clipped to that day, so an overnight shift appears on both
 * days it touches. Overlapping items are split into lanes; back-to-back ones
 * are not overlapping (half-open, like the clash rule).
 */
export type CalendarShiftInput = { id: string; jobName: string; color: string; startsAt: string; endsAt: string };
export type CalendarItem = { key: string; kind: "shift" | "event"; title: string; startsAt: string; endsAt: string; allDay: boolean; color: string; href: string | null; overlap: boolean };
export type PlacedItem = { item: CalendarItem; top: number; height: number; lane: number; lanes: number };

export function buildCalendarItems(shifts: CalendarShiftInput[], events: CalendarEvent[], colors: Map<string, string>): CalendarItem[] {
  const visibleEvents = events.filter((event) => !event.declined);
  const shiftItems = shifts.map((shift): CalendarItem => ({
    key: `shift:${shift.id}`, kind: "shift", title: shift.jobName, startsAt: shift.startsAt, endsAt: shift.endsAt, allDay: false,
    color: shift.color, href: `/shifts/${shift.id}/edit`, overlap: findClashes(shift, visibleEvents).length > 0,
  }));
  const eventItems = visibleEvents.map((event): CalendarItem => ({
    key: `event:${event.calendarId}:${event.id}`, kind: "event", title: event.title, startsAt: event.startsAt, endsAt: event.endsAt, allDay: event.allDay,
    color: colors.get(event.calendarId) ?? "#9486ff", href: null,
    overlap: shifts.some((shift) => findClashes(shift, [event]).length > 0),
  }));
  return [...shiftItems, ...eventItems];
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
    return { item, from, to, top: (from - start) / 60_000, height: (to - from) / 60_000, lane: 0, lanes: 1 };
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
