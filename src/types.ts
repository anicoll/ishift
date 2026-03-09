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
  tagIds: string[]; // tags this worker has
}

export interface ShiftType {
  id: string;
  name: string;
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
  color: string;
  requiredTagIds: string[]; // workers must hold ALL of these tags to be assignable
}

export interface Assignment {
  id: string;
  date: string;    // "YYYY-MM-DD"
  shiftId: string;
  workerId: string;
  notes: string;
}

export type View = 'schedule' | 'workers' | 'shifts' | 'tags';
