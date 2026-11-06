type ZonedParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

/** Wall-clock parts of `date` in an IANA time zone. */
export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') };
}

/** Offset of the zone from UTC at `date`, in milliseconds (positive east of Greenwich). */
export function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** UTC instant of local midnight for the day containing `date` in `timeZone`. */
export function startOfDayInTimeZone(date: Date, timeZone: string): Date {
  const p = zonedParts(date, timeZone);
  const localMidnightAsUtc = Date.UTC(p.year, p.month - 1, p.day);
  const guess = new Date(localMidnightAsUtc - timeZoneOffsetMs(date, timeZone));
  // Re-evaluate the offset at midnight itself so DST transitions earlier in the day are respected.
  return new Date(localMidnightAsUtc - timeZoneOffsetMs(guess, timeZone));
}

/** "2026-11-07" in the given zone; used as a stable daily slot key. */
export function localDateKey(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}
