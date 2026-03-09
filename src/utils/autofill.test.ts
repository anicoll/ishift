import { describe, it, expect } from 'vitest';
import { greedyAutoFill, dayOfWeekIndex, workerAvailableForShift, availabilityCoversShift } from './autofill';
import type { Worker, ShiftType, Assignment } from '../types';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeWorker(overrides: Partial<Worker> = {}): Worker {
  return {
    id: 'w1',
    name: 'Alice',
    role: 'Staff',
    color: '#000',
    tagIds: [],
    maxShiftsPerWeek: 5,
    availability: Array.from({ length: 7 }, () => ({ start: '00:00', end: '23:59' })),
    ...overrides,
  };
}

function makeShift(overrides: Partial<ShiftType> = {}): ShiftType {
  return {
    id: 's1',
    name: 'Morning',
    start: '09:00',
    end: '17:00',
    color: '#fff',
    requiredTagIds: [],
    minWorkers: 1,
    ...overrides,
  };
}

/** Monday of 2024-W01 (1 Jan 2024 is a Monday). */
const WEEK_MON = new Date('2024-01-01T00:00:00Z');

// ── dayOfWeekIndex ────────────────────────────────────────────────────────────

describe('dayOfWeekIndex', () => {
  it('returns 0 for Monday', () => {
    expect(dayOfWeekIndex('2024-01-01')).toBe(0); // Mon
  });
  it('returns 1 for Tuesday', () => {
    expect(dayOfWeekIndex('2024-01-02')).toBe(1); // Tue
  });
  it('returns 4 for Friday', () => {
    expect(dayOfWeekIndex('2024-01-05')).toBe(4); // Fri
  });
  it('returns 5 for Saturday', () => {
    expect(dayOfWeekIndex('2024-01-06')).toBe(5); // Sat
  });
  it('returns 6 for Sunday', () => {
    expect(dayOfWeekIndex('2024-01-07')).toBe(6); // Sun
  });
});

// ── availabilityCoversShift ───────────────────────────────────────────────────

describe('availabilityCoversShift', () => {
  const morning = makeShift({ start: '09:00', end: '17:00' });
  const night   = makeShift({ start: '22:00', end: '06:00' }); // overnight

  it('returns true when availability fully contains the shift', () => {
    expect(availabilityCoversShift({ start: '00:00', end: '23:59' }, morning)).toBe(true);
    expect(availabilityCoversShift({ start: '09:00', end: '17:00' }, morning)).toBe(true);
    expect(availabilityCoversShift({ start: '08:00', end: '18:00' }, morning)).toBe(true);
  });

  it('returns false when availability starts after the shift starts', () => {
    expect(availabilityCoversShift({ start: '10:00', end: '18:00' }, morning)).toBe(false);
  });

  it('returns false when availability ends before the shift ends', () => {
    expect(availabilityCoversShift({ start: '08:00', end: '16:00' }, morning)).toBe(false);
  });

  it('returns true for overnight shifts regardless of hours (day-level check only)', () => {
    expect(availabilityCoversShift({ start: '09:00', end: '17:00' }, night)).toBe(true);
    expect(availabilityCoversShift({ start: '00:00', end: '08:00' }, night)).toBe(true);
  });
});

// ── workerAvailableForShift ───────────────────────────────────────────────────

describe('workerAvailableForShift', () => {
  const morning = makeShift({ start: '09:00', end: '17:00' });

  it('returns true when worker has no availability set', () => {
    const w = makeWorker({ availability: [] });
    expect(workerAvailableForShift(w, '2024-01-01', morning)).toBe(true);
  });

  it('returns true on an available day within hours', () => {
    const w = makeWorker(); // all days 00:00-23:59
    expect(workerAvailableForShift(w, '2024-01-01', morning)).toBe(true); // Monday
  });

  it('returns false when day is marked null (unavailable)', () => {
    const availability = Array.from({ length: 7 }, () => ({ start: '00:00', end: '23:59' })) as ({ start: string; end: string } | null)[];
    availability[1] = null; // Tuesday unavailable
    const w = makeWorker({ availability });
    expect(workerAvailableForShift(w, '2024-01-02', morning)).toBe(false); // Tuesday
    expect(workerAvailableForShift(w, '2024-01-01', morning)).toBe(true);  // Monday still ok
  });

  it('returns false when shift hours fall outside worker availability', () => {
    const availability = Array.from({ length: 7 }, () => ({ start: '10:00', end: '14:00' }));
    const w = makeWorker({ availability });
    expect(workerAvailableForShift(w, '2024-01-01', morning)).toBe(false); // 09:00-17:00 not covered
  });
});

// ── greedyAutoFill ────────────────────────────────────────────────────────────

describe('greedyAutoFill', () => {
  it('returns empty result when no shifts or workers', () => {
    const result = greedyAutoFill(WEEK_MON, [], [], []);
    expect(result.assignments).toHaveLength(0);
    expect(result.slots).toHaveLength(0);
  });

  it('assigns a single eligible worker to a single shift for every day', () => {
    const worker = makeWorker({ maxShiftsPerWeek: 7 });
    const shift  = makeShift({ minWorkers: 1 });
    const result = greedyAutoFill(WEEK_MON, [shift], [worker], []);
    // 7 days × 1 shift × 1 worker each
    expect(result.assignments).toHaveLength(7);
    result.assignments.forEach(a => {
      expect(a.workerId).toBe(worker.id);
      expect(a.shiftId).toBe(shift.id);
    });
  });

  it('respects maxShiftsPerWeek', () => {
    const worker = makeWorker({ maxShiftsPerWeek: 3 });
    const shift  = makeShift({ minWorkers: 1 });
    const result = greedyAutoFill(WEEK_MON, [shift], [worker], []);
    expect(result.assignments).toHaveLength(3);
  });

  it('reports unfilledCount when no eligible workers remain', () => {
    const worker = makeWorker({ maxShiftsPerWeek: 1 });
    const shift  = makeShift({ minWorkers: 1 });
    const result = greedyAutoFill(WEEK_MON, [shift], [worker], []);
    const unfilled = result.slots.filter(s => s.unfilledCount > 0);
    expect(unfilled).toHaveLength(6); // 7 days, only 1 can be filled
  });

  it('does not assign a worker who is unavailable on a specific day', () => {
    // Worker unavailable on Wednesday (index 2)
    const availability = Array.from({ length: 7 }, () => ({ start: '00:00', end: '23:59' })) as ({ start: string; end: string } | null)[];
    availability[2] = null; // Wednesday
    const worker = makeWorker({ availability, maxShiftsPerWeek: 7 });
    const shift  = makeShift({ minWorkers: 1 });
    const result = greedyAutoFill(WEEK_MON, [shift], [worker], []);

    const wednesdayDate = '2024-01-03'; // Wednesday of WEEK_MON
    const wedAssignment = result.assignments.find(a => a.date === wednesdayDate);
    expect(wedAssignment).toBeUndefined();

    // Should still fill the other 6 days
    expect(result.assignments).toHaveLength(6);
  });

  it('does not assign a worker whose hours do not cover the shift', () => {
    // Worker only available 10:00–16:00 but shift is 09:00–17:00
    const availability = Array.from({ length: 7 }, () => ({ start: '10:00', end: '16:00' }));
    const worker = makeWorker({ availability });
    const shift  = makeShift({ start: '09:00', end: '17:00', minWorkers: 1 });
    const result = greedyAutoFill(WEEK_MON, [shift], [worker], []);
    expect(result.assignments).toHaveLength(0);
    expect(result.slots.every(s => s.unfilledCount === 1)).toBe(true);
  });

  it('does not assign to already-filled slots', () => {
    const worker = makeWorker({ maxShiftsPerWeek: 7 });
    const shift  = makeShift({ minWorkers: 1 });
    const existing: Assignment[] = [
      { id: 'a1', date: '2024-01-01', shiftId: shift.id, workerId: worker.id, notes: '' },
    ];
    const result = greedyAutoFill(WEEK_MON, [shift], [worker], existing);
    // Monday already has the worker; remaining 6 days should be filled
    expect(result.assignments).toHaveLength(6);
    const monday = result.assignments.find(a => a.date === '2024-01-01');
    expect(monday).toBeUndefined();
  });

  it('respects required tags — only assigns eligible workers', () => {
    const w1 = makeWorker({ id: 'w1', tagIds: ['nurse'] });
    const w2 = makeWorker({ id: 'w2', tagIds: [] });
    const shift = makeShift({ requiredTagIds: ['nurse'], minWorkers: 1 });
    const result = greedyAutoFill(WEEK_MON, [shift], [w1, w2], []);
    result.assignments.forEach(a => expect(a.workerId).toBe('w1'));
  });

  it('balances load across workers', () => {
    const w1 = makeWorker({ id: 'w1', maxShiftsPerWeek: 7 });
    const w2 = makeWorker({ id: 'w2', maxShiftsPerWeek: 7 });
    const shift = makeShift({ minWorkers: 1 });
    const result = greedyAutoFill(WEEK_MON, [shift], [w1, w2], []);
    const w1Count = result.assignments.filter(a => a.workerId === 'w1').length;
    const w2Count = result.assignments.filter(a => a.workerId === 'w2').length;
    // 7 slots, 2 workers — should be roughly balanced (3 or 4 each)
    expect(Math.abs(w1Count - w2Count)).toBeLessThanOrEqual(1);
  });

  it('handles Mon/Tue/Fri only availability correctly', () => {
    // Worker available Mon(0), Tue(1), Fri(4) only
    const availability = Array.from({ length: 7 }, (_, i) =>
      [0, 1, 4].includes(i) ? { start: '00:00', end: '23:59' } : null,
    ) as ({ start: string; end: string } | null)[];
    const worker = makeWorker({ availability });
    const shift  = makeShift({ minWorkers: 1 });
    const result = greedyAutoFill(WEEK_MON, [shift], [worker], []);

    const assignedDates = result.assignments.map(a => a.date);
    expect(assignedDates).toContain('2024-01-01'); // Mon
    expect(assignedDates).toContain('2024-01-02'); // Tue
    expect(assignedDates).toContain('2024-01-05'); // Fri
    expect(assignedDates).not.toContain('2024-01-03'); // Wed
    expect(assignedDates).not.toContain('2024-01-04'); // Thu
    expect(assignedDates).not.toContain('2024-01-06'); // Sat
    expect(assignedDates).not.toContain('2024-01-07'); // Sun
    expect(result.assignments).toHaveLength(3);
  });
});
