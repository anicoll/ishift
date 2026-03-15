import type { SchedulePeriodPreset } from '../types'

/** Returns the Monday of the week containing `date`. */
export function startOfWeek(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay() // 0 = Sun
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

/** Returns an array of 7 Date objects (Mon–Sun) for the week starting at `monday`. */
export function weekDays(monday: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(d.getDate() + i)
    return d
  })
}

/** Formats a Date as "YYYY-MM-DD" using local time — used as the storage/lookup key. */
export function toISODate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Formats a Date as "Mon 3", "Tue 4", etc. */
export function formatDayHeader(date: Date): string {
  return date.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric' })
}

/** Formats a week range label, e.g. "Mar 3 – Mar 9, 2025". */
export function formatWeekRange(monday: Date): string {
  const sunday = new Date(monday)
  sunday.setDate(sunday.getDate() + 6)
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  const start = monday.toLocaleDateString('en-AU', opts)
  const end = sunday.toLocaleDateString('en-AU', { ...opts, year: 'numeric' })
  return `${start} – ${end}`
}

export function isToday(date: Date): boolean {
  return toISODate(date) === toISODate(new Date())
}

/** Adds `n` weeks to a Date. */
export function addWeeks(date: Date, n: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + n * 7)
  return d
}

// ── Period-aware utilities ────────────────────────────────────────────────────

/**
 * Returns the start of the scheduling period containing `date`.
 * - week:      Monday of that week
 * - fortnight: Monday of the 2-week block (reference: Jan 5 1970)
 * - month:     1st of the calendar month
 * - custom:    returns `date` unchanged (caller controls the range)
 */
export function startOfPeriod(date: Date, preset: SchedulePeriodPreset): Date {
  if (preset === 'week') return startOfWeek(date)

  if (preset === 'month') {
    const d = new Date(date)
    d.setDate(1)
    d.setHours(0, 0, 0, 0)
    return d
  }

  if (preset === 'fortnight') {
    // Count 14-day blocks from a reference Monday (Jan 5, 1970)
    const REF_MS = new Date(1970, 0, 5).getTime()
    const MS_PER_DAY = 86_400_000
    const daysSinceRef = Math.floor((date.getTime() - REF_MS) / MS_PER_DAY)
    const blockIndex = Math.floor(daysSinceRef / 14)
    const d = new Date(1970, 0, 5 + blockIndex * 14)
    d.setHours(0, 0, 0, 0)
    return d
  }

  // custom — no snapping, caller provides explicit dates
  return date
}

/**
 * Returns an array of Date objects for the full scheduling period starting at `start`.
 * For 'custom', pass the explicit `endDate`; it is ignored for other presets.
 */
export function periodDays(start: Date, preset: SchedulePeriodPreset, endDate?: Date): Date[] {
  if (preset === 'week') return weekDays(start)

  if (preset === 'fortnight') {
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date(start)
      d.setDate(d.getDate() + i)
      return d
    })
  }

  if (preset === 'month') {
    const daysInMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate()
    return Array.from(
      { length: daysInMonth },
      (_, i) => new Date(start.getFullYear(), start.getMonth(), i + 1),
    )
  }

  // custom
  if (!endDate || endDate < start) return [new Date(start)]
  const result: Date[] = []
  const cursor = new Date(start)
  cursor.setHours(0, 0, 0, 0)
  const stop = new Date(endDate)
  stop.setHours(0, 0, 0, 0)
  while (cursor <= stop) {
    result.push(new Date(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return result
}

/**
 * Moves a preset period start forward/backward by `n` periods.
 * Not applicable to 'custom' (returns `date` unchanged).
 */
export function addPeriod(date: Date, n: number, preset: SchedulePeriodPreset): Date {
  if (preset === 'week') return addWeeks(date, n)
  if (preset === 'fortnight') return addWeeks(date, n * 2)
  if (preset === 'month') {
    const d = new Date(date)
    d.setMonth(d.getMonth() + n)
    return d
  }
  return date // custom
}

/** Formats a human-readable label for the period. */
export function formatPeriodRange(
  start: Date,
  preset: SchedulePeriodPreset,
  endDate?: Date,
): string {
  if (preset === 'week') return formatWeekRange(start)

  if (preset === 'month') {
    return start.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })
  }

  const end =
    preset === 'custom'
      ? (endDate ?? start)
      : (() => {
          const d = new Date(start)
          d.setDate(d.getDate() + 13)
          return d
        })()

  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  return `${start.toLocaleDateString('en-AU', opts)} – ${end.toLocaleDateString('en-AU', { ...opts, year: 'numeric' })}`
}
