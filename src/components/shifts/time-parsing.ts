function pad(value: number) {
  return String(value).padStart(2, "0");
}

/** "17:30" -> "5:30 PM". Returns "" for anything that is not a 24-hour clock value. */
export function formatTimeOfDay(time: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return "";
  return `${hour % 12 || 12}:${pad(minute)} ${hour < 12 ? "AM" : "PM"}`;
}

/**
 * Accepts the shapes people actually type for a shift time: 5p, 5pm, 5:30 PM,
 * 530pm, 17:30, 1730, and a bare hour read as 24-hour. Returns "HH:mm".
 */
export function parseTimeOfDay(input: string): string | null {
  const value = input.trim().toLowerCase().replace(/[\s.]+/g, "");
  if (!value) return null;

  const match = /^(\d{1,2})(?::?(\d{2}))?(am?|pm?)?$/.exec(value);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = match[2] === undefined ? 0 : Number(match[2]);
  const meridiem = match[3]?.[0];
  if (minute > 59) return null;

  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (meridiem === "p" ? 12 : 0);
  } else if (hour > 23) {
    return null;
  }

  return `${pad(hour)}:${pad(minute)}`;
}

/** 510 -> "8h 30m". Whole hours and sub-hour spans drop the half they do not need. */
export function formatDurationMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest}m`;
  if (!rest) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

/** Accepts 8h 30m, 8h, 45m, 8:30, 8.5h, and a bare number read as hours. */
export function parseDurationToMinutes(input: string): number | null {
  const value = input.trim().toLowerCase().replace(/\s+/g, "");
  if (!value) return null;

  const clock = /^(\d{1,3}):(\d{2})$/.exec(value);
  if (clock) {
    const minute = Number(clock[2]);
    return minute > 59 ? null : Number(clock[1]) * 60 + minute;
  }

  const parts = /^(?:(\d+(?:\.\d+)?)h)?(?:(\d+)m)?$/.exec(value);
  if (parts && (parts[1] !== undefined || parts[2] !== undefined)) {
    return Math.round(Number(parts[1] ?? 0) * 60) + Number(parts[2] ?? 0);
  }

  if (/^\d+(?:\.\d+)?$/.test(value)) return Math.round(Number(value) * 60);

  return null;
}
