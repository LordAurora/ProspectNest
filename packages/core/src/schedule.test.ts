import { describe, expect, it } from 'vitest';
import { nextRecheckWindow, planSlots, type ScheduleSettings } from './schedule';

const settings: ScheduleSettings = { timezone: 'Europe/Istanbul', scheduleEnabled: true, recheckHour: 3, recheckIntervalDays: 7 };

describe('planSlots', () => {
  it('waits for the local recheck hour', () => {
    // 23:30 UTC = 02:30 in Istanbul
    expect(planSlots(settings, new Date('2026-11-06T23:30:00Z'))).toEqual([]);
    const [slot] = planSlots(settings, new Date('2026-11-07T00:30:00Z'));
    expect(slot?.slot).toBe('recheck:2026-11-07');
    expect(slot?.dueBefore.toISOString()).toBe('2026-10-31T00:30:00.000Z');
  });

  it('gives every tick of the same local day the same slot', () => {
    const morning = planSlots(settings, new Date('2026-11-07T05:00:00Z'))[0]?.slot;
    const evening = planSlots(settings, new Date('2026-11-07T20:00:00Z'))[0]?.slot;
    expect(morning).toBe(evening);
  });

  it('creates a single catch-up slot after a long downtime', () => {
    // Off for ten days: the first tick back plans only today, not ten runs.
    expect(planSlots(settings, new Date('2026-11-17T09:00:00Z')).map((s) => s.slot)).toEqual(['recheck:2026-11-17']);
  });

  it('uses the campaign zone, not the server zone', () => {
    const ny = { ...settings, timezone: 'America/New_York' };
    // 06:00 UTC = 01:00 in New York, before the window.
    expect(planSlots(ny, new Date('2026-11-07T06:00:00Z'))).toEqual([]);
    expect(planSlots(ny, new Date('2026-11-07T09:00:00Z'))[0]?.slot).toBe('recheck:2026-11-07');
  });

  it('does nothing when the schedule is off', () => {
    expect(planSlots({ ...settings, scheduleEnabled: false }, new Date('2026-11-07T12:00:00Z'))).toEqual([]);
  });
});

describe('nextRecheckWindow', () => {
  it('returns local 03:00 today or tomorrow', () => {
    expect(nextRecheckWindow(settings, new Date('2026-11-06T22:00:00Z'))?.toISOString()).toBe('2026-11-07T00:00:00.000Z');
    expect(nextRecheckWindow(settings, new Date('2026-11-07T10:00:00Z'))?.toISOString()).toBe('2026-11-08T00:00:00.000Z');
  });
});
