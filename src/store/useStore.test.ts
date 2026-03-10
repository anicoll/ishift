import { describe, it, expect } from 'vitest';
import { isWorkerHolidayExpired } from './useStore';
import type { WorkerHoliday } from '../types';

function makeHoliday(endDate: string): WorkerHoliday {
  return { id: 'h1', workerId: 'w1', startDate: endDate, endDate, note: '' };
}

/** Returns a "YYYY-MM-DD" string offset by `days` from `base`. */
function offsetDate(base: string, days: number): string {
  const [y, m, d] = base.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const ny = dt.getFullYear();
  const nm = String(dt.getMonth() + 1).padStart(2, '0');
  const nd = String(dt.getDate()).padStart(2, '0');
  return `${ny}-${nm}-${nd}`;
}

describe('isWorkerHolidayExpired', () => {
  const TODAY = '2026-03-10';

  it('returns false when the holiday ended today', () => {
    expect(isWorkerHolidayExpired(makeHoliday(TODAY), TODAY)).toBe(false);
  });

  it('returns false when the holiday ends in the future', () => {
    expect(isWorkerHolidayExpired(makeHoliday(offsetDate(TODAY, 7)), TODAY)).toBe(false);
  });

  it('returns false when the holiday ended 1 day ago', () => {
    expect(isWorkerHolidayExpired(makeHoliday(offsetDate(TODAY, -1)), TODAY)).toBe(false);
  });

  it('returns false when the holiday ended exactly 59 days ago', () => {
    expect(isWorkerHolidayExpired(makeHoliday(offsetDate(TODAY, -59)), TODAY)).toBe(false);
  });

  it('returns false when the holiday ended exactly 60 days ago (boundary — still within grace)', () => {
    // cutoff = today - 60; endDate === cutoff means endDate is NOT less than cutoff
    expect(isWorkerHolidayExpired(makeHoliday(offsetDate(TODAY, -60)), TODAY)).toBe(false);
  });

  it('returns true when the holiday ended 61 days ago', () => {
    expect(isWorkerHolidayExpired(makeHoliday(offsetDate(TODAY, -61)), TODAY)).toBe(true);
  });

  it('returns true when the holiday ended 90 days ago', () => {
    expect(isWorkerHolidayExpired(makeHoliday(offsetDate(TODAY, -90)), TODAY)).toBe(true);
  });

  it('returns true when the holiday ended a full year ago', () => {
    expect(isWorkerHolidayExpired(makeHoliday(offsetDate(TODAY, -365)), TODAY)).toBe(true);
  });

  it('uses endDate for expiry, not startDate', () => {
    // startDate is very old but endDate is recent — should NOT be expired
    const h: WorkerHoliday = { id: 'h1', workerId: 'w1', startDate: '2020-01-01', endDate: TODAY, note: '' };
    expect(isWorkerHolidayExpired(h, TODAY)).toBe(false);
  });

  it('works correctly across a year boundary', () => {
    const today = '2026-01-15';
    // 61 days before Jan 15 2026 = Nov 15 2025
    expect(isWorkerHolidayExpired(makeHoliday('2025-11-14'), today)).toBe(true);
    expect(isWorkerHolidayExpired(makeHoliday('2025-11-16'), today)).toBe(false);
  });
});
