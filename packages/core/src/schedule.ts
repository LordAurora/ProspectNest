import { localDateKey, zonedParts } from './time';

export type ScheduleSettings = {
  timezone: string;
  scheduleEnabled: boolean;
  /** Local hour (0–23) after which the daily recheck may start. */
  recheckHour: number;
  recheckIntervalDays: number;
};

export type PlannedSlot = { kind: 'recheck'; slot: string; dueBefore: Date };

/**
 * Decides which scheduled run a campaign needs right now. Slots are keyed by
 * the local calendar day, so however long the machine was off, at most one
 * catch-up run exists per day, and two schedulers seeing the same moment
 * compute the same key (the database unique index keeps only one).
 */
export function planSlots(settings: ScheduleSettings, now: Date): PlannedSlot[] {
  if (!settings.scheduleEnabled) return [];
  const local = zonedParts(now, settings.timezone);
  if (local.hour < settings.recheckHour) return [];
  return [
    {
      kind: 'recheck',
      slot: `recheck:${localDateKey(now, settings.timezone)}`,
      // Businesses last verified before this instant are due again.
      dueBefore: new Date(now.getTime() - settings.recheckIntervalDays * 24 * 60 * 60 * 1000),
    },
  ];
}

/** Next moment the recheck window opens, for display. */
export function nextRecheckWindow(settings: ScheduleSettings, now: Date): Date | null {
  if (!settings.scheduleEnabled) return null;
  const local = zonedParts(now, settings.timezone);
  const offsetMs = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second) - Math.floor(now.getTime() / 1000) * 1000;
  const dayOffset = local.hour < settings.recheckHour ? 0 : 1;
  const target = Date.UTC(local.year, local.month - 1, local.day + dayOffset, settings.recheckHour);
  return new Date(target - offsetMs);
}
