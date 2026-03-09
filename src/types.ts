export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface Worker {
  id: string;
  name: string;
  role: string;
  color: string;
  tagIds: string[];         // tags this worker holds
  maxShiftsPerWeek: number; // upper bound used by the autofill algorithm
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

export type View = 'schedule' | 'workers' | 'shifts' | 'tags';
