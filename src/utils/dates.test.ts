import { describe, it, expect } from 'vitest';
import { startOfWeek, weekDays, toISODate, addWeeks, isToday } from './dates';

/** Format a Date using local time components — avoids UTC vs local-time skew. */
function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

describe('startOfWeek', () => {
  it('returns the same day when given a Monday', () => {
    const monday = new Date(2024, 0, 1, 12, 0, 0); // 2024-Jan-01 noon local
    expect(startOfWeek(monday).getDay()).toBe(1);   // still Monday
    expect(localDateStr(startOfWeek(monday))).toBe('2024-01-01');
  });

  it('returns the preceding Monday when given a Wednesday', () => {
    const wed = new Date(2024, 0, 3, 12, 0, 0); // 2024-Jan-03 noon local
    const result = startOfWeek(wed);
    expect(result.getDay()).toBe(1); // Monday
    expect(localDateStr(result)).toBe('2024-01-01');
  });

  it('returns the preceding Monday when given a Sunday', () => {
    const sun = new Date(2024, 0, 7, 12, 0, 0); // 2024-Jan-07 noon local
    const result = startOfWeek(sun);
    expect(result.getDay()).toBe(1); // Monday
    expect(localDateStr(result)).toBe('2024-01-01');
  });

  it('returns the preceding Monday when given a Saturday', () => {
    const sat = new Date(2024, 0, 6, 12, 0, 0); // 2024-Jan-06 noon local
    const result = startOfWeek(sat);
    expect(result.getDay()).toBe(1); // Monday
    expect(localDateStr(result)).toBe('2024-01-01');
  });

  it('zeroes out time components', () => {
    const d = startOfWeek(new Date(2024, 0, 3, 15, 30, 45));
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    expect(d.getSeconds()).toBe(0);
  });
});

describe('weekDays', () => {
  it('returns exactly 7 days', () => {
    const monday = new Date(2024, 0, 1, 0, 0, 0);
    expect(weekDays(monday)).toHaveLength(7);
  });

  it('returns Mon–Sun in order', () => {
    const monday = new Date(2024, 0, 1, 0, 0, 0);
    const days = weekDays(monday).map(localDateStr);
    expect(days).toEqual([
      '2024-01-01', // Mon
      '2024-01-02', // Tue
      '2024-01-03', // Wed
      '2024-01-04', // Thu
      '2024-01-05', // Fri
      '2024-01-06', // Sat
      '2024-01-07', // Sun
    ]);
  });
});

describe('toISODate', () => {
  it('formats a local-time Date as YYYY-MM-DD', () => {
    // Construct using local-time args so local date is unambiguous regardless of timezone
    const d = new Date(2024, 2, 15, 9, 0, 0); // March 15 2024 09:00 local
    expect(toISODate(d)).toBe('2024-03-15');
  });

  it('uses local date components, not UTC', () => {
    // new Date(year, month, day) midnight local — getDate() must equal the day arg
    const d = new Date(2024, 5, 1, 0, 0, 0); // June 1 2024 midnight local
    const result = toISODate(d);
    // The year/month/day extracted from result must match the local components
    const [y, m, day] = result.split('-').map(Number);
    expect(y).toBe(d.getFullYear());
    expect(m).toBe(d.getMonth() + 1);
    expect(day).toBe(d.getDate());
  });

  it('zero-pads single-digit months and days', () => {
    const d = new Date(2024, 0, 5, 9, 0, 0); // Jan 5 2024
    expect(toISODate(d)).toBe('2024-01-05');
  });
});

describe('addWeeks', () => {
  it('adds one week correctly', () => {
    const d = new Date(2024, 0, 1, 0, 0, 0);
    const result = addWeeks(d, 1);
    expect(localDateStr(result)).toBe('2024-01-08');
  });

  it('subtracts a week with n = -1', () => {
    const d = new Date(2024, 0, 8, 0, 0, 0);
    const result = addWeeks(d, -1);
    expect(localDateStr(result)).toBe('2024-01-01');
  });

  it('does not mutate the original date', () => {
    const d = new Date(2024, 0, 1, 0, 0, 0);
    addWeeks(d, 3);
    expect(localDateStr(d)).toBe('2024-01-01');
  });
});

describe('isToday', () => {
  it('returns true for today', () => {
    expect(isToday(new Date())).toBe(true);
  });

  it('returns false for yesterday', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(isToday(yesterday)).toBe(false);
  });
});
