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
  it('formats a date as YYYY-MM-DD using UTC', () => {
    // Use a noon UTC date so UTC and local date match
    expect(toISODate(new Date('2024-03-15T12:00:00Z'))).toBe('2024-03-15');
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
