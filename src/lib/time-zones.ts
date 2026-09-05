export type TimeZoneOption = { value: string; label: string };

let cache: { key: string; options: TimeZoneOption[] } | null = null;

function offsetLabel(zone: string, at: Date) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "shortOffset" }).formatToParts(at);
    return parts.find((part) => part.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
}

function optionFor(zone: string, at: Date): TimeZoneOption {
  const offset = offsetLabel(zone, at);
  return { value: zone, label: offset ? `${zone.replace(/_/g, " ")} · ${offset}` : zone.replace(/_/g, " ") };
}

/**
 * Every IANA zone this runtime knows, labelled with its current UTC offset.
 *
 * The settings form used to offer eight hardcoded North American zones, even
 * though `profileSettingsSchema` already accepts any valid IANA name. Every
 * hour, cap, and earnings figure in the app is computed in the viewer's zone,
 * so someone outside that list could not use the app correctly at all.
 *
 * Labelling all 418 zones costs roughly 50ms, so it is memoised per UTC hour --
 * an offset only moves at a DST transition, and it is decorative besides.
 */
export function timeZoneOptions(selected?: string, now = new Date()): TimeZoneOption[] {
  const key = now.toISOString().slice(0, 13);
  if (cache?.key !== key) {
    cache = { key, options: Intl.supportedValuesOf("timeZone").map((zone) => optionFor(zone, now)) };
  }
  if (!selected || cache.options.some((option) => option.value === selected)) return cache.options;
  // A zone saved before this runtime's tz database was updated, or one it spells
  // differently (Asia/Kathmandu vs Asia/Katmandu). Keep it selectable rather
  // than silently reassigning the user to a neighbour.
  return [optionFor(selected, now), ...cache.options];
}
