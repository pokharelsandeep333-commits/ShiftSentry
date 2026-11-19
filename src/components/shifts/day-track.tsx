"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { DAY_MINUTES, SNAP_MINUTES, addLocalDays, clockLabel, dayBlocks, drawSelection, minuteOf, moveEnd, moveSelection, moveStart, overlapsBlock, placeSelection, trackPercent, weekDates, weekStartDate, type DayBlock, type Selection, type TrackShift } from "@/lib/day-track";
import { formatMinutes } from "@/lib/utils";

type WeekShifts = Record<string, TrackShift[] | null>;
type DragMode = "draw" | "move" | "start" | "end";
type Drag = { mode: DragMode; pointerId: number; anchor: number; offset: number; moved: boolean; from: Selection | null };

/** A `YYYY-MM-DD` read at UTC noon, so naming its weekday cannot slip a day. */
function dayName(date: string, pattern: string) {
  return formatInTimeZone(new Date(`${date}T12:00:00.000Z`), "UTC", pattern);
}

const HOUR_LABELS = [0, 3, 6, 9, 12, 15, 18, 21, 24];

function hourLabel(hour: number) {
  if (hour === 0 || hour === 24) return "12a";
  if (hour === 12) return "12p";
  return hour < 12 ? `${hour}a` : `${hour - 12}p`;
}

/**
 * The viewer's shifts for the weeks on screen, from `/shifts/day-shifts`. A
 * week is fetched once per visit; one that cannot be read stays `null` and the
 * track simply draws nothing for it (the limit check still catches an overlap).
 */
function useWeekShifts(weeks: string[]) {
  const [loaded, setLoaded] = useState<WeekShifts>({});
  const requested = useRef(new Set<string>());
  const wanted = weeks.join("|");

  // Not aborted when the weeks change: a week already asked for is still worth
  // keeping, and browsing back to it should not ask twice.
  useEffect(() => {
    for (const week of wanted.split("|")) {
      if (!week || requested.current.has(week)) continue;
      requested.current.add(week);
      fetch(`/shifts/day-shifts?from=${week}`, { cache: "no-store" })
        .then((response) => response.json() as Promise<{ status: string; shifts?: TrackShift[] }>)
        .then((body) => setLoaded((current) => ({ ...current, [week]: body.status === "ok" && body.shifts ? body.shifts : null })))
        .catch(() => setLoaded((current) => ({ ...current, [week]: null })));
    }
  }, [wanted]);

  return loaded;
}

type DayTrackProps = {
  /** The start date, `YYYY-MM-DD`, or "" before one is picked. */
  date: string;
  selection: Selection | null;
  timeZone: string;
  weekStartsOn: number;
  /** The shift being edited, which must not be drawn as one already there. */
  excludeId?: string;
  jobName: string;
  jobColor: string;
  /** What a tap on the empty track places: the job's usual length. */
  defaultLength: number;
  onPickDate: (date: string) => void;
  onChange: (selection: Selection) => void;
};

/**
 * Picking when: a week of date tiles, then that day as one 24-hour track. Drag
 * on the empty track to draw the shift, drag it to move it, drag an end to
 * resize it, all in quarter hours. The day's other shifts are drawn under it,
 * so a clash shows before Save. Each end is also a slider for the keyboard,
 * and the typed fields under the track stay the precise way in.
 */
export function DayTrack({ date, selection, timeZone, weekStartsOn, excludeId, jobName, jobColor, defaultLength, onPickDate, onChange }: DayTrackProps) {
  const now = useMemo(() => {
    const instant = new Date();
    return { date: formatInTimeZone(instant, timeZone, "yyyy-MM-dd"), minute: minuteOf(formatInTimeZone(instant, timeZone, "HH:mm")) ?? 0 };
  }, [timeZone]);
  const day = date || now.date;

  // Browsing with the arrows moves the tiles without moving the shift. A new
  // date (picked, typed or from "Same as last time") brings its own week back.
  const [browse, setBrowse] = useState<{ week: string; forDate: string } | null>(null);
  const dayWeek = weekStartDate(day, weekStartsOn);
  const visibleWeek = browse && browse.forDate === date ? browse.week : dayWeek;
  const dates = weekDates(visibleWeek);
  const weeks = useWeekShifts(visibleWeek === dayWeek ? [dayWeek] : [visibleWeek, dayWeek]);

  const visibleShifts = (weeks[visibleWeek] ?? []).filter((shift) => shift.id !== excludeId);
  const blocks = date ? dayBlocks(date, (weeks[dayWeek] ?? []).filter((shift) => shift.id !== excludeId), timeZone) : [];
  const clash = selection ? overlapsBlock(selection, blocks) : false;

  const lane = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState<DragMode | null>(null);

  function minuteAt(clientX: number) {
    const rect = lane.current?.getBoundingClientRect();
    if (!rect || !rect.width) return 0;
    return ((clientX - rect.left) / rect.width) * DAY_MINUTES;
  }

  function begin(event: PointerEvent<HTMLElement>, mode: DragMode) {
    if (!date || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const minute = minuteAt(event.clientX);
    lane.current?.setPointerCapture(event.pointerId);
    drag.current = { mode, pointerId: event.pointerId, anchor: minute, offset: selection ? minute - selection.start : 0, moved: false, from: selection };
    setDragging(mode);
  }

  function follow(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const minute = minuteAt(event.clientX);
    // A press that has not travelled a few minutes' worth is still a tap.
    if (!current.moved && Math.abs(minute - current.anchor) < SNAP_MINUTES / 3) return;
    current.moved = true;
    if (current.mode === "draw") {
      const drawn = drawSelection(current.anchor, minute);
      if (drawn) onChange(drawn);
    } else if (current.from) {
      if (current.mode === "move") onChange(moveSelection(current.from, minute - current.offset));
      if (current.mode === "start") onChange(moveStart(current.from, minute));
      if (current.mode === "end") onChange(moveEnd(current.from, minute));
    }
  }

  function end(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (!current.moved && current.mode === "draw") onChange(placeSelection(current.anchor, defaultLength));
    drag.current = null;
    setDragging(null);
  }

  function nudge(event: KeyboardEvent<HTMLElement>, handle: "start" | "end") {
    if (!selection) return;
    const step = event.shiftKey ? 60 : SNAP_MINUTES;
    const value = handle === "start" ? selection.start : selection.end;
    const target = ({ ArrowLeft: value - step, ArrowDown: value - step, ArrowRight: value + step, ArrowUp: value + step, PageDown: value - 60, PageUp: value + 60, Home: -Infinity, End: Infinity } as Record<string, number>)[event.key];
    if (target === undefined) return;
    event.preventDefault();
    onChange(handle === "start" ? moveStart(selection, target) : moveEnd(selection, target));
  }

  const dayLabel = date ? dayName(date, "EEEE, MMM d") : "";
  const endsNextDay = selection ? selection.end > DAY_MINUTES : false;
  const valueText = (minute: number) => `${clockLabel(minute)}${minute >= DAY_MINUTES ? `, ${dayName(addLocalDays(date, 1), "EEEE")}` : ""}`;
  const monthLabel = dayName(dates[0], "MMM") === dayName(dates[6], "MMM") ? dayName(dates[0], "MMMM yyyy") : `${dayName(dates[0], "MMM")} – ${dayName(dates[6], "MMM yyyy")}`;

  return <div className="day-pick" style={{ "--job": jobColor } as CSSProperties}>
    <div className="day-week">
      <div className="day-week-head">
        <span className="day-week-month" aria-live="polite">{monthLabel}</span>
        <span className="day-week-nav">
          <button type="button" className="day-week-arrow" onClick={() => setBrowse({ week: addLocalDays(visibleWeek, -7), forDate: date })} aria-label="Previous week"><ChevronLeft aria-hidden="true" /></button>
          {visibleWeek !== dayWeek && <button type="button" className="day-week-back" onClick={() => setBrowse(null)}>Back to {date ? dayName(date, "MMM d") : "today"}</button>}
          <button type="button" className="day-week-arrow" onClick={() => setBrowse({ week: addLocalDays(visibleWeek, 7), forDate: date })} aria-label="Next week"><ChevronRight aria-hidden="true" /></button>
        </span>
      </div>
      <div className="day-week-tiles" role="group" aria-label="Day of the shift">
        {dates.map((tile) => {
          const busy = visibleShifts.some((shift) => dayBlocks(tile, [shift], timeZone).length > 0);
          return <button key={tile} type="button" className="day-week-tile" aria-pressed={tile === date} data-today={tile === now.date || undefined} onClick={() => { setBrowse(null); onPickDate(tile); }} aria-label={`${dayName(tile, "EEEE, MMMM d")}${tile === now.date ? ", today" : ""}${busy ? ", has shifts" : ""}`}>
            <span>{dayName(tile, "EEE")}</span>
            <span>{dayName(tile, "d")}</span>
            <i aria-hidden="true" data-busy={busy || undefined} />
          </button>;
        })}
      </div>
    </div>

    <div className="day-track" data-dragging={dragging ?? undefined} data-empty={!date || undefined}>
      <div className="track-hours" aria-hidden="true">{HOUR_LABELS.map((hour) => <span key={hour} data-minor={hour % 6 !== 0 || undefined} style={{ left: `${(hour / 24) * 100}%` }}>{hourLabel(hour)}</span>)}</div>
      <div ref={lane} className="track-lane" role="group" aria-label={date ? `Times on ${dayLabel}` : "Pick a day first"} onPointerDown={(event) => begin(event, "draw")} onPointerMove={follow} onPointerUp={end} onPointerCancel={end}>
        {blocks.map((block) => <TrackBlock key={block.id} block={block} />)}
        {/* The server and the browser read the clock a moment apart, so the
            minute can differ by one; the line is decorative. */}
        {date === now.date && <span className="track-now" style={{ left: `${trackPercent(now.minute)}%` }} aria-hidden="true" suppressHydrationWarning />}
        {selection && date && <span className="track-shift" data-clash={clash || undefined} data-continues={endsNextDay || undefined} style={{ left: `${trackPercent(selection.start)}%`, width: `${trackPercent(selection.end) - trackPercent(selection.start)}%` }} onPointerDown={(event) => begin(event, "move")}>
          <span className="track-shift-label" aria-hidden="true">{jobName}</span>
          <span className="track-handle" data-edge="start" role="slider" tabIndex={0} aria-label="Start time" aria-valuemin={Math.max(0, selection.end - DAY_MINUTES)} aria-valuemax={selection.end - SNAP_MINUTES} aria-valuenow={selection.start} aria-valuetext={valueText(selection.start)} onPointerDown={(event) => begin(event, "start")} onKeyDown={(event) => nudge(event, "start")} />
          <span className="track-handle" data-edge="end" role="slider" tabIndex={0} aria-label="End time" aria-valuemin={selection.start + SNAP_MINUTES} aria-valuemax={selection.start + DAY_MINUTES} aria-valuenow={selection.end} aria-valuetext={valueText(selection.end)} onPointerDown={(event) => begin(event, "end")} onKeyDown={(event) => nudge(event, "end")} />
        </span>}
      </div>
      <p className="track-readout" aria-live="polite">
        {!date ? "Pick a day, then drag across it to set the times."
          : selection ? <>
            <b>{clockLabel(selection.start)} – {clockLabel(selection.end)}</b>
            {endsNextDay && <span className="track-next-day">ends {dayName(addLocalDays(date, 1), "EEE")}</span>}
            <span>{formatMinutes(selection.end - selection.start)}</span>
            {clash && <span className="track-clash">Overlaps a shift already on this day</span>}
          </>
            : <>Drag across {dayName(date, "EEE, MMM d")} to set the times, or tap to place {formatMinutes(defaultLength)}.</>}
      </p>
      {blocks.length > 0 && <ul className="sr-only" aria-label={`Already on ${dayLabel}`}>{blocks.map((block) => <li key={block.id}>{block.jobName}, {formatInTimeZone(block.startsAt, timeZone, "EEE h:mm a")} to {formatInTimeZone(block.endsAt, timeZone, "EEE h:mm a")}</li>)}</ul>}
    </div>
  </div>;
}

function TrackBlock({ block }: { block: DayBlock }) {
  return <span className="track-block" data-before={block.fromBefore || undefined} data-continues={block.continues || undefined} style={{ left: `${trackPercent(block.start)}%`, width: `${trackPercent(block.end) - trackPercent(block.start)}%`, "--block": block.color } as CSSProperties} title={block.jobName} aria-hidden="true">
    <i /><span>{block.jobName}</span>
  </span>;
}
