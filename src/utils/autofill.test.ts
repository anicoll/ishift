import { describe, it, expect } from 'vitest';
import { greedyAutoFill, dayOfWeekIndex, workerAvailableForShift, availabilityCoversShift } from './autofill';
import { weekDays } from './dates';
import type { Worker, ShiftType, Assignment, WorkerHoliday } from '../types';

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

/** Monday of 2024-W01 (1 Jan 2024 is a Monday) — constructed in local time. */
const WEEK_MON = new Date(2024, 0, 1, 0, 0, 0);

function makeWorkerHoliday(overrides: Partial<WorkerHoliday> = {}): WorkerHoliday {
  return {
    id: 'h1',
    workerId: 'w1',
    startDate: '2024-01-01',
    endDate: '2024-01-07',
    note: '',
    ...overrides,
  };
}

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
    const result = greedyAutoFill(weekDays(WEEK_MON), [], [], []);
    expect(result.assignments).toHaveLength(0);
    expect(result.slots).toHaveLength(0);
  });

  it('assigns a single eligible worker to a single shift for every day', () => {
    const worker = makeWorker({ maxShiftsPerWeek: 7 });
    const shift  = makeShift({ minWorkers: 1 });
    const result = greedyAutoFill(weekDays(WEEK_MON), [shift], [worker], []);
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
    const result = greedyAutoFill(weekDays(WEEK_MON), [shift], [worker], []);
    expect(result.assignments).toHaveLength(3);
  });

  it('reports unfilledCount when no eligible workers remain', () => {
    const worker = makeWorker({ maxShiftsPerWeek: 1 });
    const shift  = makeShift({ minWorkers: 1 });
    const result = greedyAutoFill(weekDays(WEEK_MON), [shift], [worker], []);
    const unfilled = result.slots.filter(s => s.unfilledCount > 0);
    expect(unfilled).toHaveLength(6); // 7 days, only 1 can be filled
  });

  it('does not assign a worker who is unavailable on a specific day', () => {
    // Worker unavailable on Wednesday (index 2)
    const availability = Array.from({ length: 7 }, () => ({ start: '00:00', end: '23:59' })) as ({ start: string; end: string } | null)[];
    availability[2] = null; // Wednesday
    const worker = makeWorker({ availability, maxShiftsPerWeek: 7 });
    const shift  = makeShift({ minWorkers: 1 });
    const result = greedyAutoFill(weekDays(WEEK_MON), [shift], [worker], []);

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
    const result = greedyAutoFill(weekDays(WEEK_MON), [shift], [worker], []);
    expect(result.assignments).toHaveLength(0);
    expect(result.slots.every(s => s.unfilledCount === 1)).toBe(true);
  });

  it('does not assign to already-filled slots', () => {
    const worker = makeWorker({ maxShiftsPerWeek: 7 });
    const shift  = makeShift({ minWorkers: 1 });
    const existing: Assignment[] = [
      { id: 'a1', date: '2024-01-01', shiftId: shift.id, workerId: worker.id, notes: '' },
    ];
    const result = greedyAutoFill(weekDays(WEEK_MON), [shift], [worker], existing);
    // Monday already has the worker; remaining 6 days should be filled
    expect(result.assignments).toHaveLength(6);
    const monday = result.assignments.find(a => a.date === '2024-01-01');
    expect(monday).toBeUndefined();
  });

  it('respects required tags — only assigns eligible workers', () => {
    const w1 = makeWorker({ id: 'w1', tagIds: ['nurse'] });
    const w2 = makeWorker({ id: 'w2', tagIds: [] });
    const shift = makeShift({ requiredTagIds: ['nurse'], minWorkers: 1 });
    const result = greedyAutoFill(weekDays(WEEK_MON), [shift], [w1, w2], []);
    result.assignments.forEach(a => expect(a.workerId).toBe('w1'));
  });

  it('balances load across workers', () => {
    const w1 = makeWorker({ id: 'w1', maxShiftsPerWeek: 7 });
    const w2 = makeWorker({ id: 'w2', maxShiftsPerWeek: 7 });
    const shift = makeShift({ minWorkers: 1 });
    const result = greedyAutoFill(weekDays(WEEK_MON), [shift], [w1, w2], []);
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
    const result = greedyAutoFill(weekDays(WEEK_MON), [shift], [worker], []);

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

// ── greedyAutoFill — bank holidays ───────────────────────────────────────────

describe('greedyAutoFill — bank holidays', () => {
  it('skips a single bank holiday date', () => {
    const worker = makeWorker({ maxShiftsPerWeek: 7 });
    const shift  = makeShift({ minWorkers: 1 });
    const bankHolidays = new Set(['2024-01-01']); // Monday

    const result = greedyAutoFill(weekDays(WEEK_MON), [shift], [worker], [], bankHolidays);

    expect(result.assignments).toHaveLength(6); // 7 days − 1 holiday
    expect(result.assignments.find(a => a.date === '2024-01-01')).toBeUndefined();
  });

  it('skips multiple bank holiday dates', () => {
    const worker = makeWorker({ maxShiftsPerWeek: 7 });
    const shift  = makeShift({ minWorkers: 1 });
    const bankHolidays = new Set(['2024-01-01', '2024-01-03', '2024-01-05']); // Mon, Wed, Fri

    const result = greedyAutoFill(weekDays(WEEK_MON), [shift], [worker], [], bankHolidays);

    expect(result.assignments).toHaveLength(4);
    const dates = result.assignments.map(a => a.date);
    expect(dates).not.toContain('2024-01-01');
    expect(dates).not.toContain('2024-01-03');
    expect(dates).not.toContain('2024-01-05');
    expect(dates).toContain('2024-01-02'); // Tue
    expect(dates).toContain('2024-01-04'); // Thu
    expect(dates).toContain('2024-01-06'); // Sat
    expect(dates).toContain('2024-01-07'); // Sun
  });

  it('produces no slots for bank holiday dates', () => {
    const worker = makeWorker({ maxShiftsPerWeek: 7 });
    const shift  = makeShift({ minWorkers: 1 });
    const bankHolidays = new Set(['2024-01-01', '2024-01-02']);

    const result = greedyAutoFill(weekDays(WEEK_MON), [shift], [worker], [], bankHolidays);

    const slotDates = result.slots.map(s => s.date);
    expect(slotDates).not.toContain('2024-01-01');
    expect(slotDates).not.toContain('2024-01-02');
  });

  it('still fills non-holiday days when some days are holidays', () => {
    const worker = makeWorker({ maxShiftsPerWeek: 7 });
    const shift  = makeShift({ minWorkers: 1 });
    const bankHolidays = new Set(['2024-01-07']); // Only Sunday is a holiday

    const result = greedyAutoFill(weekDays(WEEK_MON), [shift], [worker], [], bankHolidays);

    expect(result.assignments).toHaveLength(6);
    expect(result.assignments.every(a => a.date !== '2024-01-07')).toBe(true);
  });

  it('returns empty result when every day is a bank holiday', () => {
    const worker = makeWorker({ maxShiftsPerWeek: 7 });
    const shift  = makeShift({ minWorkers: 1 });
    const allDays = new Set([
      '2024-01-01', '2024-01-02', '2024-01-03',
      '2024-01-04', '2024-01-05', '2024-01-06', '2024-01-07',
    ]);

    const result = greedyAutoFill(weekDays(WEEK_MON), [shift], [worker], [], allDays);

    expect(result.assignments).toHaveLength(0);
    expect(result.slots).toHaveLength(0);
  });
});

// ── greedyAutoFill — worker holidays ─────────────────────────────────────────

describe('greedyAutoFill — worker holidays', () => {
  it('excludes a worker on holiday from assignments on those dates', () => {
    const worker = makeWorker({ id: 'w1', maxShiftsPerWeek: 7 });
    const shift  = makeShift({ minWorkers: 1 });
    const holidays = [makeWorkerHoliday({ workerId: 'w1', startDate: '2024-01-01', endDate: '2024-01-03' })];

    const result = greedyAutoFill(weekDays(WEEK_MON), [shift], [worker], [], new Set(), holidays);

    // Mon–Wed excluded; Thu–Sun assigned
    expect(result.assignments).toHaveLength(4);
    const dates = result.assignments.map(a => a.date);
    expect(dates).not.toContain('2024-01-01');
    expect(dates).not.toContain('2024-01-02');
    expect(dates).not.toContain('2024-01-03');
    expect(dates).toContain('2024-01-04');
  });

  it('reports unfilled slots for days where all workers are on holiday', () => {
    const worker = makeWorker({ id: 'w1', maxShiftsPerWeek: 7 });
    const shift  = makeShift({ minWorkers: 1 });
    // Worker on holiday for entire week
    const holidays = [makeWorkerHoliday({ workerId: 'w1', startDate: '2024-01-01', endDate: '2024-01-07' })];

    const result = greedyAutoFill(weekDays(WEEK_MON), [shift], [worker], [], new Set(), holidays);

    expect(result.assignments).toHaveLength(0);
    expect(result.slots.every(s => s.unfilledCount > 0)).toBe(true);
  });

  it('assigns other workers when one is on holiday', () => {
    const w1 = makeWorker({ id: 'w1', maxShiftsPerWeek: 7 });
    const w2 = makeWorker({ id: 'w2', maxShiftsPerWeek: 7 });
    const shift = makeShift({ minWorkers: 1 });
    // w1 on holiday for the whole week
    const holidays = [makeWorkerHoliday({ workerId: 'w1', startDate: '2024-01-01', endDate: '2024-01-07' })];

    const result = greedyAutoFill(weekDays(WEEK_MON), [shift], [w1, w2], [], new Set(), holidays);

    expect(result.assignments).toHaveLength(7);
    result.assignments.forEach(a => expect(a.workerId).toBe('w2'));
  });

  it('respects single-day worker holiday', () => {
    const worker = makeWorker({ id: 'w1', maxShiftsPerWeek: 7 });
    const shift  = makeShift({ minWorkers: 1 });
    // Holiday on Wednesday only
    const holidays = [makeWorkerHoliday({ workerId: 'w1', startDate: '2024-01-03', endDate: '2024-01-03' })];

    const result = greedyAutoFill(weekDays(WEEK_MON), [shift], [worker], [], new Set(), holidays);

    expect(result.assignments).toHaveLength(6);
    expect(result.assignments.find(a => a.date === '2024-01-03')).toBeUndefined();
  });

  it('worker not on holiday on dates outside the range is still assigned', () => {
    const worker = makeWorker({ id: 'w1', maxShiftsPerWeek: 7 });
    const shift  = makeShift({ minWorkers: 1 });
    const holidays = [makeWorkerHoliday({ workerId: 'w1', startDate: '2024-01-04', endDate: '2024-01-06' })];

    const result = greedyAutoFill(weekDays(WEEK_MON), [shift], [worker], [], new Set(), holidays);

    expect(result.assignments).toHaveLength(4); // Mon, Tue, Wed, Sun
    const dates = result.assignments.map(a => a.date);
    expect(dates).toContain('2024-01-01'); // Mon
    expect(dates).toContain('2024-01-02'); // Tue
    expect(dates).toContain('2024-01-03'); // Wed
    expect(dates).toContain('2024-01-07'); // Sun
  });

  it('holiday for one worker does not affect other workers', () => {
    const w1 = makeWorker({ id: 'w1', maxShiftsPerWeek: 7 });
    const w2 = makeWorker({ id: 'w2', maxShiftsPerWeek: 7 });
    const shift = makeShift({ minWorkers: 2 }); // needs 2 workers
    // w1 on holiday Monday only
    const holidays = [makeWorkerHoliday({ workerId: 'w1', startDate: '2024-01-01', endDate: '2024-01-01' })];

    const result = greedyAutoFill(weekDays(WEEK_MON), [shift], [w1, w2], [], new Set(), holidays);

    // Monday: only w2 can be assigned (1 of 2 needed → unfilledCount 1)
    const mondaySlot = result.slots.find(s => s.date === '2024-01-01');
    expect(mondaySlot).toBeDefined();
    expect(mondaySlot!.toAssign.map(w => w.id)).not.toContain('w1');
    expect(mondaySlot!.toAssign.map(w => w.id)).toContain('w2');
  });
});

// ── greedyAutoFill — bank holidays + worker holidays combined ─────────────────

describe('greedyAutoFill — bank holidays and worker holidays combined', () => {
  it('respects both bank holidays and worker holidays simultaneously', () => {
    const w1 = makeWorker({ id: 'w1', maxShiftsPerWeek: 7 });
    const w2 = makeWorker({ id: 'w2', maxShiftsPerWeek: 7 });
    const shift = makeShift({ minWorkers: 1 });

    const bankHolidays = new Set(['2024-01-01']); // Monday is a public holiday
    const workerHolidays = [
      makeWorkerHoliday({ workerId: 'w1', startDate: '2024-01-02', endDate: '2024-01-03' }), // w1 off Tue–Wed
    ];

    const result = greedyAutoFill(weekDays(WEEK_MON), [shift], [w1, w2], [], bankHolidays, workerHolidays);

    const dates = result.assignments.map(a => a.date);
    expect(dates).not.toContain('2024-01-01'); // bank holiday — no assignments at all
    // Tue and Wed: only w2 eligible (w1 on holiday)
    const tue = result.assignments.find(a => a.date === '2024-01-02');
    const wed = result.assignments.find(a => a.date === '2024-01-03');
    expect(tue?.workerId).toBe('w2');
    expect(wed?.workerId).toBe('w2');
    // Thu–Sun: both workers eligible
    expect(result.assignments.filter(a => a.date >= '2024-01-04')).toHaveLength(4);
  });
});
