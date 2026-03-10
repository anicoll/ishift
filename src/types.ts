export interface Tag {
  id: string;
  name: string;
  color: string;
}

/** A time window within a single day. */
export interface DayTimeRange {
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
}

export interface Worker {
  id: string;
  name: string;
  role: string;
  color: string;
  tagIds: string[];         // tags this worker holds
  maxShiftsPerWeek: number; // upper bound used by the autofill algorithm
  /**
   * Per-day availability, indexed 0 (Monday) … 6 (Sunday).
   * null  → worker is unavailable on that day.
   * DayTimeRange → available during those hours.
   * Omitted entirely → no restrictions (fully available).
   */
  availability: (DayTimeRange | null)[];
}

export interface ShiftType {
  id: string;
  name: string;
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
  color: string;
  requiredTagIds: string[]; // workers must hold ALL of these tags to be assignable
  minWorkers: number;       // target coverage used by the autofill algorithm
}

export interface Assignment {
  id: string;
  date: string;    // "YYYY-MM-DD"
  shiftId: string;
  workerId: string;
  notes: string;
}

export interface BankHoliday {
  id: string;
  date: string;  // "YYYY-MM-DD"
  name: string;
}

export interface WorkerHoliday {
  id: string;
  workerId: string;
  startDate: string;  // "YYYY-MM-DD"
  endDate: string;    // "YYYY-MM-DD"
  note: string;
}

export type View = 'schedule' | 'workers' | 'shifts' | 'tags';
