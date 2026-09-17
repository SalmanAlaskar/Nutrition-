/// <reference types="jest" />
import type { MealSlot } from '@/types';

import {
  addDays,
  currentSlot,
  daysBetween,
  formatDayLabel,
  formatShortDay,
  formatTime,
  lastNDays,
  parseDateKey,
  slotForHour,
  toDateKey,
  todayKey,
  weekdayInitial,
} from './date';

describe('toDateKey and parseDateKey', () => {
  it('formats a local date with zero padding', () => {
    expect(toDateKey(new Date(2024, 0, 5))).toBe('2024-01-05');
    expect(toDateKey(new Date(2024, 11, 31))).toBe('2024-12-31');
  });

  it('parses to local midnight, not UTC midnight', () => {
    const parsed = parseDateKey('2024-03-10');
    expect(parsed.getFullYear()).toBe(2024);
    expect(parsed.getMonth()).toBe(2);
    expect(parsed.getDate()).toBe(10);
    expect(parsed.getHours()).toBe(0);
    expect(parsed.getMinutes()).toBe(0);
  });

  it('round-trips every key in a year regardless of the local timezone', () => {
    let key = '2024-01-01';
    for (let i = 0; i < 366; i += 1) {
      expect(toDateKey(parseDateKey(key))).toBe(key);
      key = addDays(key, 1);
    }
    expect(key).toBe('2025-01-01');
  });

  it('round-trips a date built at a time of day that would flip under UTC', () => {
    for (const hour of [0, 1, 12, 22, 23]) {
      const date = new Date(2024, 6, 15, hour, 30);
      expect(toDateKey(date)).toBe('2024-07-15');
    }
  });

  it('todayKey agrees with toDateKey for now', () => {
    expect(todayKey()).toBe(toDateKey(new Date()));
  });
});

describe('addDays', () => {
  it('crosses a month end in both directions', () => {
    expect(addDays('2024-01-31', 1)).toBe('2024-02-01');
    expect(addDays('2024-04-30', 1)).toBe('2024-05-01');
    expect(addDays('2024-05-01', -1)).toBe('2024-04-30');
  });

  it('crosses a year end in both directions', () => {
    expect(addDays('2023-12-31', 1)).toBe('2024-01-01');
    expect(addDays('2024-01-01', -1)).toBe('2023-12-31');
    expect(addDays('2023-12-25', 10)).toBe('2024-01-04');
  });

  it('handles the leap day', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2024-02-29', 1)).toBe('2024-03-01');
    expect(addDays('2023-02-28', 1)).toBe('2023-03-01');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
    expect(addDays('2024-02-29', 365)).toBe('2025-02-28');
  });

  it('returns the same key for zero days', () => {
    expect(addDays('2024-06-01', 0)).toBe('2024-06-01');
  });
});

describe('daysBetween', () => {
  it('counts forwards, backwards and across a leap year', () => {
    expect(daysBetween('2024-03-01', '2024-03-10')).toBe(9);
    expect(daysBetween('2024-03-10', '2024-03-01')).toBe(-9);
    expect(daysBetween('2024-03-10', '2024-03-10')).toBe(0);
    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2);
    expect(daysBetween('2023-02-28', '2023-03-01')).toBe(1);
    expect(daysBetween('2024-01-01', '2025-01-01')).toBe(366);
  });

  it('survives a daylight-saving shift, where the raw difference is not 24h', () => {
    expect(daysBetween('2024-03-09', '2024-03-11')).toBe(2);
    expect(daysBetween('2024-11-02', '2024-11-04')).toBe(2);
  });
});

describe('lastNDays', () => {
  it('returns `count` keys, oldest first, ending on the end key', () => {
    const keys = lastNDays(7, '2024-03-10');
    expect(keys).toHaveLength(7);
    expect(keys[0]).toBe('2024-03-04');
    expect(keys[keys.length - 1]).toBe('2024-03-10');
    expect([...keys].sort()).toEqual(keys);
  });

  it('returns a single key for a count of one and nothing for zero', () => {
    expect(lastNDays(1, '2024-03-10')).toEqual(['2024-03-10']);
    expect(lastNDays(0, '2024-03-10')).toEqual([]);
  });

  it('defaults to ending today', () => {
    const keys = lastNDays(3);
    expect(keys).toHaveLength(3);
    expect(keys[2]).toBe(todayKey());
  });

  it('crosses a month boundary', () => {
    expect(lastNDays(3, '2024-03-01')).toEqual(['2024-02-28', '2024-02-29', '2024-03-01']);
  });
});

describe('formatDayLabel', () => {
  const today = '2024-03-10';

  it('names today, yesterday and tomorrow relative to the override', () => {
    expect(formatDayLabel(today, today)).toBe('Today');
    expect(formatDayLabel('2024-03-09', today)).toBe('Yesterday');
    expect(formatDayLabel('2024-03-11', today)).toBe('Tomorrow');
  });

  it('falls back to a weekday and date for anything further away', () => {
    expect(formatDayLabel('2024-03-08', today)).toBe('Fri, 8 Mar');
    expect(formatDayLabel('2024-03-12', today)).toBe('Tue, 12 Mar');
    expect(formatDayLabel('2023-12-25', today)).toBe('Mon, 25 Dec');
  });

  it('moves the relative labels with the override', () => {
    expect(formatDayLabel('2024-03-09', '2024-03-09')).toBe('Today');
    expect(formatDayLabel('2024-03-09', '2024-03-10')).toBe('Yesterday');
    expect(formatDayLabel('2024-03-09', '2024-03-08')).toBe('Tomorrow');
    expect(formatDayLabel('2024-03-09', '2024-03-07')).toBe('Sat, 9 Mar');
  });

  it('handles relative labels across a month end', () => {
    expect(formatDayLabel('2024-02-29', '2024-03-01')).toBe('Yesterday');
    expect(formatDayLabel('2024-03-01', '2024-02-29')).toBe('Tomorrow');
  });

  it('defaults to the real today when no override is given', () => {
    expect(formatDayLabel(todayKey())).toBe('Today');
    expect(formatDayLabel(addDays(todayKey(), -1))).toBe('Yesterday');
  });
});

describe('formatShortDay and weekdayInitial', () => {
  it('formats a short day', () => {
    expect(formatShortDay('2024-03-10')).toBe('10 Mar');
    expect(formatShortDay('2024-12-01')).toBe('1 Dec');
  });

  it('returns the first letter of the weekday', () => {
    // 2024-03-10 is a Sunday.
    expect(weekdayInitial('2024-03-10')).toBe('S');
    expect(weekdayInitial('2024-03-11')).toBe('M');
    expect(weekdayInitial('2024-03-12')).toBe('T');
    expect(weekdayInitial('2024-03-13')).toBe('W');
    expect(weekdayInitial('2024-03-14')).toBe('T');
    expect(weekdayInitial('2024-03-15')).toBe('F');
    expect(weekdayInitial('2024-03-16')).toBe('S');
  });
});

describe('slotForHour', () => {
  it.each([
    [0, 'breakfast'],
    [10, 'breakfast'],
    [11, 'lunch'],
    [15, 'lunch'],
    [16, 'dinner'],
    [21, 'dinner'],
    [22, 'snack'],
    [23, 'snack'],
  ] as const)('maps hour %i to %s', (hour, expected: MealSlot) => {
    expect(slotForHour(hour)).toBe(expected);
  });

  it('currentSlot reads the hour off the supplied date', () => {
    expect(currentSlot(new Date(2024, 2, 10, 8, 0))).toBe('breakfast');
    expect(currentSlot(new Date(2024, 2, 10, 13, 0))).toBe('lunch');
    expect(currentSlot(new Date(2024, 2, 10, 19, 0))).toBe('dinner');
    expect(currentSlot(new Date(2024, 2, 10, 23, 30))).toBe('snack');
  });
});

describe('formatTime', () => {
  const localIso = (hours: number, minutes: number) =>
    new Date(2024, 2, 10, hours, minutes).toISOString();

  it('shows midnight and noon as 12', () => {
    expect(formatTime(localIso(0, 0))).toBe('12:00 AM');
    expect(formatTime(localIso(12, 0))).toBe('12:00 PM');
  });

  it('pads the minutes and picks the right suffix', () => {
    expect(formatTime(localIso(7, 5))).toBe('7:05 AM');
    expect(formatTime(localIso(11, 59))).toBe('11:59 AM');
    expect(formatTime(localIso(13, 45))).toBe('1:45 PM');
    expect(formatTime(localIso(23, 9))).toBe('11:09 PM');
  });

  it('returns an empty string for an unparseable timestamp', () => {
    expect(formatTime('not a timestamp')).toBe('');
    expect(formatTime('')).toBe('');
  });
});
