import { useState, useEffect, useCallback } from 'react'
import type {
  Tag,
  Worker,
  ShiftType,
  Assignment,
  BankHoliday,
  WorkerHoliday,
  ScheduleDefinition,
} from '../types'

// ── helpers ──────────────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2, 10)
}

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function persist<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value))
}

// ── constants ─────────────────────────────────────────────────────────────────

export const DEFAULT_SCHEDULE_ID = 'sd_default'

// ── seed data ─────────────────────────────────────────────────────────────────

const SEED_SCHEDULE_DEFINITIONS: ScheduleDefinition[] = [
  {
    id: DEFAULT_SCHEDULE_ID,
    name: 'Work Week',
    lengthDays: 7,
    // Mon–Fri only
    workDays: [true, true, true, true, true, false, false],
  },
]

const SEED_TAGS: Tag[] = [
  { id: 't1', name: 'Certified Nurse', color: '#4f8ef7' },
  { id: 't2', name: 'Forklift Licensed', color: '#f9a825' },
  { id: 't3', name: 'First Aid', color: '#e0544b' },
]

/** Full availability for all 7 days (Mon–Sun), no hour restrictions. */
const FULL_AVAILABILITY = Array.from({ length: 7 }, () => ({ start: '00:00', end: '23:59' }))

const SEED_WORKERS: Worker[] = [
  {
    id: 'w1',
    name: 'Alice Johnson',
    role: 'Manager',
    color: '#4f8ef7',
    tagIds: ['t1', 't3'],
    maxShiftsPerWeek: 5,
    availability: FULL_AVAILABILITY,
  },
  {
    id: 'w2',
    name: 'Bob Smith',
    role: 'Staff',
    color: '#e0544b',
    tagIds: ['t2'],
    maxShiftsPerWeek: 5,
    availability: FULL_AVAILABILITY,
  },
  {
    id: 'w3',
    name: 'Carol White',
    role: 'Staff',
    color: '#34c98b',
    tagIds: ['t1'],
    maxShiftsPerWeek: 4,
    availability: FULL_AVAILABILITY,
  },
]

const SEED_SHIFTS: ShiftType[] = [
  {
    id: 's1',
    name: 'Morning',
    start: '06:00',
    end: '14:00',
    color: '#f9a825',
    requiredTagIds: [],
    minWorkers: 1,
  },
  {
    id: 's2',
    name: 'Afternoon',
    start: '14:00',
    end: '22:00',
    color: '#7e57c2',
    requiredTagIds: ['t1'],
    minWorkers: 1,
  },
  {
    id: 's3',
    name: 'Night',
    start: '22:00',
    end: '06:00',
    color: '#1976d2',
    requiredTagIds: ['t3'],
    minWorkers: 1,
  },
]

// ── store hook ────────────────────────────────────────────────────────────────

export interface Store {
  tags: Tag[]
  workers: Worker[]
  shifts: ShiftType[]
  assignments: Assignment[]
  bankHolidays: BankHoliday[]
  workerHolidays: WorkerHoliday[]
  // Tags
  addTag: (data: Omit<Tag, 'id'>) => void
  updateTag: (id: string, data: Partial<Omit<Tag, 'id'>>) => void
  deleteTag: (id: string) => void
  // Workers
  addWorker: (data: Omit<Worker, 'id'>) => void
  updateWorker: (id: string, data: Partial<Omit<Worker, 'id'>>) => void
  deleteWorker: (id: string) => void
  // Shifts
  addShift: (data: Omit<ShiftType, 'id'>) => void
  updateShift: (id: string, data: Partial<Omit<ShiftType, 'id'>>) => void
  deleteShift: (id: string) => void
  // Shift ordering
  reorderShifts: (ids: string[]) => void
  // Assignments
  addAssignment: (data: Omit<Assignment, 'id'>) => void
  addAssignments: (data: Omit<Assignment, 'id'>[]) => void
  deleteAssignment: (id: string) => void
  updateAssignmentNotes: (id: string, notes: string) => void
  /** Remove all assignments whose date falls within the given set of ISO date strings. */
  deleteAssignmentsForDates: (dates: string[]) => void
  getAssignmentsFor: (date: string, shiftId: string) => Assignment[]
  /** Workers who have all tags required by the given shift. */
  eligibleWorkers: (shiftId: string) => Worker[]
  // Bank Holidays
  addBankHoliday: (data: Omit<BankHoliday, 'id'>) => void
  deleteBankHoliday: (id: string) => void
  // Worker Holidays
  addWorkerHoliday: (data: Omit<WorkerHoliday, 'id'>) => void
  deleteWorkerHoliday: (id: string) => void
  /** Returns true if the worker is on holiday on the given date. */
  workerOnHoliday: (workerId: string, date: string) => boolean
  // Schedule definitions
  scheduleDefinitions: ScheduleDefinition[]
  addScheduleDefinition: (data: Omit<ScheduleDefinition, 'id'>) => void
  updateScheduleDefinition: (id: string, data: Partial<Omit<ScheduleDefinition, 'id'>>) => void
  deleteScheduleDefinition: (id: string) => void
  activeScheduleId: string
  setActiveScheduleId: (id: string) => void
}

// ── worker holiday expiry ─────────────────────────────────────────────────────

const WORKER_HOLIDAY_EXPIRY_DAYS = 60

/**
 * Returns true when a worker holiday ended more than WORKER_HOLIDAY_EXPIRY_DAYS
 * days ago relative to `todayStr` (a "YYYY-MM-DD" local-date string).
 */
export function isWorkerHolidayExpired(h: WorkerHoliday, todayStr: string): boolean {
  // Subtract expiry days from today to get the cutoff date string
  const [y, m, d] = todayStr.split('-').map(Number)
  const cutoff = new Date(y, m - 1, d)
  cutoff.setDate(cutoff.getDate() - WORKER_HOLIDAY_EXPIRY_DAYS)
  const cy = cutoff.getFullYear()
  const cm = String(cutoff.getMonth() + 1).padStart(2, '0')
  const cd = String(cutoff.getDate()).padStart(2, '0')
  return h.endDate < `${cy}-${cm}-${cd}`
}

// ── migration helpers (fill in fields added after initial release) ────────────

function migrateWorker(w: Worker): Worker {
  return {
    ...w,
    tagIds: w.tagIds ?? [],
    maxShiftsPerWeek: w.maxShiftsPerWeek ?? 5,
    // Workers created before availability was added default to fully available
    availability:
      w.availability ?? Array.from({ length: 7 }, () => ({ start: '00:00', end: '23:59' })),
  }
}

function migrateShift(s: ShiftType): ShiftType {
  return {
    ...s,
    requiredTagIds: s.requiredTagIds ?? [],
    minWorkers: s.minWorkers ?? 1,
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export function useStore(): Store {
  const [tags, setTags] = useState<Tag[]>(() => load('ishift_tags', SEED_TAGS))
  const [workers, setWorkers] = useState<Worker[]>(() =>
    load('ishift_workers', SEED_WORKERS).map(migrateWorker),
  )
  const [shifts, setShifts] = useState<ShiftType[]>(() =>
    load('ishift_shifts', SEED_SHIFTS).map(migrateShift),
  )
  const [assignments, setAssignments] = useState<Assignment[]>(() => load('ishift_assignments', []))
  const [bankHolidays, setBankHolidays] = useState<BankHoliday[]>(() =>
    load('ishift_bank_holidays', []),
  )
  const [scheduleDefinitions, setScheduleDefinitions] = useState<ScheduleDefinition[]>(() =>
    load('ishift_schedule_definitions', SEED_SCHEDULE_DEFINITIONS),
  )
  const [activeScheduleId, setActiveScheduleIdState] = useState<string>(() =>
    load('ishift_active_schedule_id', DEFAULT_SCHEDULE_ID),
  )

  const [workerHolidays, setWorkerHolidays] = useState<WorkerHoliday[]>(() => {
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    return load<WorkerHoliday[]>('ishift_worker_holidays', []).filter(
      (h) => !isWorkerHolidayExpired(h, todayStr),
    )
  })

  useEffect(() => {
    persist('ishift_tags', tags)
  }, [tags])
  useEffect(() => {
    persist('ishift_workers', workers)
  }, [workers])
  useEffect(() => {
    persist('ishift_shifts', shifts)
  }, [shifts])
  useEffect(() => {
    persist('ishift_assignments', assignments)
  }, [assignments])
  useEffect(() => {
    persist('ishift_bank_holidays', bankHolidays)
  }, [bankHolidays])
  useEffect(() => {
    persist('ishift_worker_holidays', workerHolidays)
  }, [workerHolidays])
  useEffect(() => {
    persist('ishift_schedule_definitions', scheduleDefinitions)
  }, [scheduleDefinitions])
  useEffect(() => {
    persist('ishift_active_schedule_id', activeScheduleId)
  }, [activeScheduleId])

  const setActiveScheduleId = useCallback((id: string) => {
    setActiveScheduleIdState(id)
  }, [])

  // Tags
  const addTag = useCallback((data: Omit<Tag, 'id'>) => {
    setTags((prev) => [...prev, { id: uid(), ...data }])
  }, [])

  const updateTag = useCallback((id: string, data: Partial<Omit<Tag, 'id'>>) => {
    setTags((prev) => prev.map((t) => (t.id === id ? { ...t, ...data } : t)))
  }, [])

  const deleteTag = useCallback((id: string) => {
    setTags((prev) => prev.filter((t) => t.id !== id))
    // Cascade: remove this tag from workers and shifts
    setWorkers((prev) => prev.map((w) => ({ ...w, tagIds: w.tagIds.filter((tid) => tid !== id) })))
    setShifts((prev) =>
      prev.map((s) => ({ ...s, requiredTagIds: s.requiredTagIds.filter((tid) => tid !== id) })),
    )
  }, [])

  // Workers
  const addWorker = useCallback((data: Omit<Worker, 'id'>) => {
    setWorkers((prev) => [...prev, { id: uid(), ...data }])
  }, [])

  const updateWorker = useCallback((id: string, data: Partial<Omit<Worker, 'id'>>) => {
    setWorkers((prev) => prev.map((w) => (w.id === id ? { ...w, ...data } : w)))
  }, [])

  const deleteWorker = useCallback((id: string) => {
    setWorkers((prev) => prev.filter((w) => w.id !== id))
    setAssignments((prev) => prev.filter((a) => a.workerId !== id))
  }, [])

  // Shifts
  const addShift = useCallback((data: Omit<ShiftType, 'id'>) => {
    setShifts((prev) => [...prev, { id: uid(), ...data }])
  }, [])

  const updateShift = useCallback((id: string, data: Partial<Omit<ShiftType, 'id'>>) => {
    setShifts((prev) => prev.map((s) => (s.id === id ? { ...s, ...data } : s)))
  }, [])

  const deleteShift = useCallback((id: string) => {
    setShifts((prev) => prev.filter((s) => s.id !== id))
    setAssignments((prev) => prev.filter((a) => a.shiftId !== id))
  }, [])

  const reorderShifts = useCallback((ids: string[]) => {
    setShifts((prev) => {
      const map = new Map(prev.map((s) => [s.id, s]))
      return ids.flatMap((id) => (map.has(id) ? [map.get(id)!] : []))
    })
  }, [])

  // Assignments
  const addAssignment = useCallback((data: Omit<Assignment, 'id'>) => {
    setAssignments((prev) => [...prev, { id: uid(), ...data }])
  }, [])

  const addAssignments = useCallback((data: Omit<Assignment, 'id'>[]) => {
    setAssignments((prev) => [...prev, ...data.map((d) => ({ id: uid(), ...d }))])
  }, [])

  const deleteAssignment = useCallback((id: string) => {
    setAssignments((prev) => prev.filter((a) => a.id !== id))
  }, [])

  const updateAssignmentNotes = useCallback((id: string, notes: string) => {
    setAssignments((prev) => prev.map((a) => (a.id === id ? { ...a, notes } : a)))
  }, [])

  const deleteAssignmentsForDates = useCallback((dates: string[]) => {
    const dateSet = new Set(dates)
    setAssignments((prev) => prev.filter((a) => !dateSet.has(a.date)))
  }, [])

  const getAssignmentsFor = useCallback(
    (date: string, shiftId: string): Assignment[] =>
      assignments.filter((a) => a.date === date && a.shiftId === shiftId),
    [assignments],
  )

  const eligibleWorkers = useCallback(
    (shiftId: string): Worker[] => {
      const shift = shifts.find((s) => s.id === shiftId)
      if (!shift || shift.requiredTagIds.length === 0) return workers
      return workers.filter((w) => shift.requiredTagIds.every((tid) => w.tagIds.includes(tid)))
    },
    [shifts, workers],
  )

  // Schedule Definitions
  const addScheduleDefinition = useCallback((data: Omit<ScheduleDefinition, 'id'>) => {
    setScheduleDefinitions((prev) => [...prev, { id: uid(), ...data }])
  }, [])

  const updateScheduleDefinition = useCallback(
    (id: string, data: Partial<Omit<ScheduleDefinition, 'id'>>) => {
      setScheduleDefinitions((prev) => prev.map((s) => (s.id === id ? { ...s, ...data } : s)))
    },
    [],
  )

  const deleteScheduleDefinition = useCallback((id: string) => {
    setScheduleDefinitions((prev) => prev.filter((s) => s.id !== id))
    setActiveScheduleIdState((prev) => {
      // If the deleted schedule was active, fall back to the first remaining one
      if (prev !== id) return prev
      const remaining = scheduleDefinitions.filter((s) => s.id !== id)
      return remaining[0]?.id ?? DEFAULT_SCHEDULE_ID
    })
  }, [scheduleDefinitions])

  // Bank Holidays
  const addBankHoliday = useCallback((data: Omit<BankHoliday, 'id'>) => {
    setBankHolidays((prev) => [...prev, { id: uid(), ...data }])
  }, [])

  const deleteBankHoliday = useCallback((id: string) => {
    setBankHolidays((prev) => prev.filter((h) => h.id !== id))
  }, [])

  // Worker Holidays
  const addWorkerHoliday = useCallback((data: Omit<WorkerHoliday, 'id'>) => {
    setWorkerHolidays((prev) => [...prev, { id: uid(), ...data }])
  }, [])

  const deleteWorkerHoliday = useCallback((id: string) => {
    setWorkerHolidays((prev) => prev.filter((h) => h.id !== id))
  }, [])

  const workerOnHoliday = useCallback(
    (workerId: string, date: string): boolean => {
      return workerHolidays.some(
        (h) => h.workerId === workerId && h.startDate <= date && h.endDate >= date,
      )
    },
    [workerHolidays],
  )

  return {
    tags,
    workers,
    shifts,
    assignments,
    bankHolidays,
    workerHolidays,
    addTag,
    updateTag,
    deleteTag,
    addWorker,
    updateWorker,
    deleteWorker,
    addShift,
    updateShift,
    deleteShift,
    reorderShifts,
    addAssignment,
    addAssignments,
    deleteAssignment,
    updateAssignmentNotes,
    deleteAssignmentsForDates,
    getAssignmentsFor,
    eligibleWorkers,
    addBankHoliday,
    deleteBankHoliday,
    addWorkerHoliday,
    deleteWorkerHoliday,
    workerOnHoliday,
    scheduleDefinitions,
    addScheduleDefinition,
    updateScheduleDefinition,
    deleteScheduleDefinition,
    activeScheduleId,
    setActiveScheduleId,
  }
}
