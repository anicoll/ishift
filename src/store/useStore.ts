import { useState, useEffect, useCallback } from 'react';
import type { Tag, Worker, ShiftType, Assignment } from '../types';

// ── helpers ──────────────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function persist<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

// ── seed data ─────────────────────────────────────────────────────────────────

const SEED_TAGS: Tag[] = [
  { id: 't1', name: 'Certified Nurse', color: '#4f8ef7' },
  { id: 't2', name: 'Forklift Licensed', color: '#f9a825' },
  { id: 't3', name: 'First Aid', color: '#e0544b' },
];

const SEED_WORKERS: Worker[] = [
  { id: 'w1', name: 'Alice Johnson', role: 'Manager', color: '#4f8ef7', tagIds: ['t1', 't3'] },
  { id: 'w2', name: 'Bob Smith',     role: 'Staff',   color: '#e0544b', tagIds: ['t2'] },
  { id: 'w3', name: 'Carol White',   role: 'Staff',   color: '#34c98b', tagIds: ['t1'] },
];

const SEED_SHIFTS: ShiftType[] = [
  { id: 's1', name: 'Morning',   start: '06:00', end: '14:00', color: '#f9a825', requiredTagIds: [] },
  { id: 's2', name: 'Afternoon', start: '14:00', end: '22:00', color: '#7e57c2', requiredTagIds: ['t1'] },
  { id: 's3', name: 'Night',     start: '22:00', end: '06:00', color: '#1976d2', requiredTagIds: ['t3'] },
];

// ── store hook ────────────────────────────────────────────────────────────────

export interface Store {
  tags: Tag[];
  workers: Worker[];
  shifts: ShiftType[];
  assignments: Assignment[];
  // Tags
  addTag: (data: Omit<Tag, 'id'>) => void;
  updateTag: (id: string, data: Partial<Omit<Tag, 'id'>>) => void;
  deleteTag: (id: string) => void;
  // Workers
  addWorker: (data: Omit<Worker, 'id'>) => void;
  updateWorker: (id: string, data: Partial<Omit<Worker, 'id'>>) => void;
  deleteWorker: (id: string) => void;
  // Shifts
  addShift: (data: Omit<ShiftType, 'id'>) => void;
  updateShift: (id: string, data: Partial<Omit<ShiftType, 'id'>>) => void;
  deleteShift: (id: string) => void;
  // Assignments
  addAssignment: (data: Omit<Assignment, 'id'>) => void;
  deleteAssignment: (id: string) => void;
  getAssignmentsFor: (date: string, shiftId: string) => Assignment[];
  /** Workers who have all tags required by the given shift. */
  eligibleWorkers: (shiftId: string) => Worker[];
}

export function useStore(): Store {
  const [tags, setTags] = useState<Tag[]>(() => load('ishift_tags', SEED_TAGS));
  const [workers, setWorkers] = useState<Worker[]>(() => load('ishift_workers', SEED_WORKERS));
  const [shifts, setShifts] = useState<ShiftType[]>(() => load('ishift_shifts', SEED_SHIFTS));
  const [assignments, setAssignments] = useState<Assignment[]>(() => load('ishift_assignments', []));

  useEffect(() => { persist('ishift_tags', tags); }, [tags]);
  useEffect(() => { persist('ishift_workers', workers); }, [workers]);
  useEffect(() => { persist('ishift_shifts', shifts); }, [shifts]);
  useEffect(() => { persist('ishift_assignments', assignments); }, [assignments]);

  // Tags
  const addTag = useCallback((data: Omit<Tag, 'id'>) => {
    setTags(prev => [...prev, { id: uid(), ...data }]);
  }, []);

  const updateTag = useCallback((id: string, data: Partial<Omit<Tag, 'id'>>) => {
    setTags(prev => prev.map(t => (t.id === id ? { ...t, ...data } : t)));
  }, []);

  const deleteTag = useCallback((id: string) => {
    setTags(prev => prev.filter(t => t.id !== id));
    // Cascade: remove this tag from workers and shifts
    setWorkers(prev => prev.map(w => ({ ...w, tagIds: w.tagIds.filter(tid => tid !== id) })));
    setShifts(prev => prev.map(s => ({ ...s, requiredTagIds: s.requiredTagIds.filter(tid => tid !== id) })));
  }, []);

  // Workers
  const addWorker = useCallback((data: Omit<Worker, 'id'>) => {
    setWorkers(prev => [...prev, { id: uid(), ...data }]);
  }, []);

  const updateWorker = useCallback((id: string, data: Partial<Omit<Worker, 'id'>>) => {
    setWorkers(prev => prev.map(w => (w.id === id ? { ...w, ...data } : w)));
  }, []);

  const deleteWorker = useCallback((id: string) => {
    setWorkers(prev => prev.filter(w => w.id !== id));
    setAssignments(prev => prev.filter(a => a.workerId !== id));
  }, []);

  // Shifts
  const addShift = useCallback((data: Omit<ShiftType, 'id'>) => {
    setShifts(prev => [...prev, { id: uid(), ...data }]);
  }, []);

  const updateShift = useCallback((id: string, data: Partial<Omit<ShiftType, 'id'>>) => {
    setShifts(prev => prev.map(s => (s.id === id ? { ...s, ...data } : s)));
  }, []);

  const deleteShift = useCallback((id: string) => {
    setShifts(prev => prev.filter(s => s.id !== id));
    setAssignments(prev => prev.filter(a => a.shiftId !== id));
  }, []);

  // Assignments
  const addAssignment = useCallback((data: Omit<Assignment, 'id'>) => {
    setAssignments(prev => [...prev, { id: uid(), ...data }]);
  }, []);

  const deleteAssignment = useCallback((id: string) => {
    setAssignments(prev => prev.filter(a => a.id !== id));
  }, []);

  const getAssignmentsFor = useCallback(
    (date: string, shiftId: string): Assignment[] =>
      assignments.filter(a => a.date === date && a.shiftId === shiftId),
    [assignments],
  );

  const eligibleWorkers = useCallback(
    (shiftId: string): Worker[] => {
      const shift = shifts.find(s => s.id === shiftId);
      if (!shift || shift.requiredTagIds.length === 0) return workers;
      return workers.filter(w =>
        shift.requiredTagIds.every(tid => w.tagIds.includes(tid)),
      );
    },
    [shifts, workers],
  );

  return {
    tags, workers, shifts, assignments,
    addTag, updateTag, deleteTag,
    addWorker, updateWorker, deleteWorker,
    addShift, updateShift, deleteShift,
    addAssignment, deleteAssignment,
    getAssignmentsFor, eligibleWorkers,
  };
}
