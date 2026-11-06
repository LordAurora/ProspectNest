const numberFormat = new Intl.NumberFormat('tr-TR');
const dateTimeFormat = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' });
const relativeFormat = new Intl.RelativeTimeFormat('tr-TR', { numeric: 'auto', style: 'short' });

export const formatNumber = (value: number) => numberFormat.format(value);

export const formatDateTime = (value: Date) => dateTimeFormat.format(value);

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
];

/** "3 dk. önce", "dün" — falls back to an absolute date after a week. */
export function formatRelative(value: Date, now: Date = new Date()): string {
  const diff = value.getTime() - now.getTime();
  if (Math.abs(diff) > 7 * 86_400_000) return dateTimeFormat.format(value);
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diff) >= ms) return relativeFormat.format(Math.round(diff / ms), unit);
  }
  return 'az önce';
}
