import type { Worker, ShiftType, Assignment, DayTimeRange } from '../types';
import { weekDays, toISODate } from './dates';

export interface AutoFillSlot {
  date: string;
  shift: ShiftType;
  /** Workers that will be assigned (new assignments only). */
  toAssign: Worker[];
  /** How many more workers were needed but no eligible candidates remained. */
  unfilledCount: number;
}

export interface AutoFillResult {
  slots: AutoFillSlot[];
  /** Flat list ready to pass to addAssignments(). */
  assignments: Omit<Assignment, 'id'>[];
}

/**
 * Returns the day-of-week index (0 = Monday … 6 = Sunday) for a "YYYY-MM-DD" string.
 * Uses noon UTC to avoid DST edge-cases.
 */
export function dayOfWeekIndex(dateStr: string): number {
  const jsDay = new Date(dateStr + 'T12:00:00Z').getUTCDay(); // 0=Sun, 1=Mon…6=Sat
  return jsDay === 0 ? 6 : jsDay - 1;
}

/**
 * Returns true when a worker's availability window covers a shift.
 *
 * For non-overnight shifts the worker's window must fully contain the shift
 * (avail.start ≤ shift.start AND avail.end ≥ shift.end).
 * For overnight shifts (e.g. 22:00–06:00) we only require the worker to
 * be marked available on that day — hour-level checking across midnight is
 * intentionally deferred to manual scheduling.
 */
export function availabilityCoversShift(avail: DayTimeRange, shift: ShiftType): boolean {
  const isOvernight = shift.end < shift.start;
  if (isOvernight) return true;
  return avail.start <= shift.start && avail.end >= shift.end;
}

/**
 * Returns true when `worker` is available to work `shift` on `dateStr`.
 *
 * Rules:
 *  1. If the worker has no availability array (or it is empty), there are no
 *     restrictions — the worker is considered fully available.
 *  2. If availability[dayIndex] is null the worker is unavailable that day.
 *  3. Otherwise the worker's time window must cover the shift hours.
 */
export function workerAvailableForShift(
  worker: Worker,
  dateStr: string,
  shift: ShiftType,
): boolean {
  if (!worker.availability || worker.availability.length === 0) return true;

  const dayIdx = dayOfWeekIndex(dateStr);
  const avail = worker.availability[dayIdx];

  if (avail === null || avail === undefined) return false;
  return availabilityCoversShift(avail, shift);
}

/**
 * Greedy autofill for a single week.
 *
 * Strategy:
 *  1. Collect all (day × shift) slots that still need workers.
 *  2. Sort slots ascending by eligible-candidate count — hardest to fill first.
 *     This prevents easy slots from hoarding workers that constrained slots need.
 *  3. For each slot, pick candidates sorted by fewest weekly assignments so far
 *     (ties broken by worker order), respecting maxShiftsPerWeek.
 *  4. Assign until minWorkers is reached or candidates are exhausted.
 */
export function greedyAutoFill(
  weekStart: Date,
  shifts: ShiftType[],
  workers: Worker[],
  existingAssignments: Assignment[],
): AutoFillResult {
  const days = weekDays(weekStart);

  // Map workerId → number of assignments already in this week (existing + newly planned)
  const weekCount = new Map<string, number>();
  workers.forEach(w => weekCount.set(w.id, 0));
  existingAssignments.forEach(a => {
    weekCount.set(a.workerId, (weekCount.get(a.workerId) ?? 0) + 1);
  });

  // Eligible workers per (shift × date): must have required tags AND be available
  function eligibleFor(shift: ShiftType, dateStr: string): Worker[] {
    const tagFiltered =
      shift.requiredTagIds.length === 0
        ? workers
        : workers.filter(w => shift.requiredTagIds.every(tid => w.tagIds.includes(tid)));
    return tagFiltered.filter(w => workerAvailableForShift(w, dateStr, shift));
  }

  // Build the list of slots that need filling
  interface Slot {
    date: string;
    shift: ShiftType;
    alreadyAssignedIds: Set<string>;
    needed: number;
    eligible: Worker[];
  }

  const slots: Slot[] = [];
  for (const day of days) {
    const dateStr = toISODate(day);
    for (const shift of shifts) {
      const existing = existingAssignments.filter(
        a => a.date === dateStr && a.shiftId === shift.id,
      );
      const needed = (shift.minWorkers ?? 1) - existing.length;
      if (needed <= 0) continue;

      slots.push({
        date: dateStr,
        shift,
        alreadyAssignedIds: new Set(existing.map(a => a.workerId)),
        needed,
        eligible: eligibleFor(shift, dateStr),
      });
    }
  }

  // Sort hardest-to-fill first (fewest eligible candidates)
  slots.sort((a, b) => a.eligible.length - b.eligible.length);

  // Greedy assignment pass
  const resultSlots: AutoFillSlot[] = [];
  const newAssignments: Omit<Assignment, 'id'>[] = [];

  for (const slot of slots) {
    const candidates = slot.eligible
      .filter(w => !slot.alreadyAssignedIds.has(w.id))
      .filter(w => (weekCount.get(w.id) ?? 0) < (w.maxShiftsPerWeek ?? 5))
      .sort((a, b) => (weekCount.get(a.id) ?? 0) - (weekCount.get(b.id) ?? 0));

    const toAssign: Worker[] = [];
    for (let i = 0; i < slot.needed && i < candidates.length; i++) {
      const worker = candidates[i];
      toAssign.push(worker);
      weekCount.set(worker.id, (weekCount.get(worker.id) ?? 0) + 1);
      newAssignments.push({
        date: slot.date,
        shiftId: slot.shift.id,
        workerId: worker.id,
        notes: '',
      });
    }

    resultSlots.push({
      date: slot.date,
      shift: slot.shift,
      toAssign,
      unfilledCount: slot.needed - toAssign.length,
    });
  }

  // Re-sort result slots chronologically (date → shift order) for display
  resultSlots.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return shifts.indexOf(a.shift) - shifts.indexOf(b.shift);
  });

  return { slots: resultSlots, assignments: newAssignments };
}
