import { useState, useMemo } from 'react'
import type {
  Tag,
  Worker,
  ShiftType,
  Assignment,
  BankHoliday,
  WorkerHoliday,
  SchedulePeriodPreset,
} from '../../types'
import type { Store } from '../../store/useStore'
import {
  startOfPeriod,
  periodDays,
  toISODate,
  formatDayHeader,
  formatPeriodRange,
  isToday,
  addPeriod,
} from '../../utils/dates'
import { greedyAutoFill, type AutoFillResult } from '../../utils/autofill'
import { WorkerBadge } from '../../components/WorkerBadge'
import { TagBadge } from '../../components/TagBadge'
import { Modal } from '../../components/Modal'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { AutoFillModal } from './AutoFillModal'
import { ExportModal } from './ExportModal'
import { BankHolidayModal } from './BankHolidayModal'

// 0 = Monday … 6 = Sunday
const DAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

const PERIOD_LABELS: Record<SchedulePeriodPreset, string> = {
  week: 'Week',
  fortnight: 'Fortnight',
  month: 'Month',
  custom: 'Custom',
}

interface Props {
  workers: Worker[]
  shifts: ShiftType[]
  tags: Tag[]
  bankHolidays: BankHoliday[]
  workerHolidays: WorkerHoliday[]
  store: Pick<
    Store,
    | 'addAssignment'
    | 'addAssignments'
    | 'deleteAssignment'
    | 'updateAssignmentNotes'
    | 'deleteAssignmentsForDates'
    | 'getAssignmentsFor'
    | 'eligibleWorkers'
    | 'assignments'
    | 'reorderShifts'
    | 'addBankHoliday'
    | 'deleteBankHoliday'
    | 'schedulePeriod'
    | 'setSchedulePeriod'
    | 'customPeriodStart'
    | 'customPeriodEnd'
    | 'setCustomPeriod'
  >
}

interface AssignFormData {
  date: string
  shiftId: string
  workerId: string
  notes: string
}

interface DragState {
  type: 'new' | 'move'
  workerId: string
  assignmentId?: string
}

export function ScheduleView({
  workers,
  shifts,
  tags,
  bankHolidays,
  workerHolidays,
  store,
}: Props) {
  const { schedulePeriod, setSchedulePeriod, customPeriodStart, customPeriodEnd, setCustomPeriod } =
    store

  // ── Period navigation state (not used for 'custom') ──────────────────────
  const [periodStart, setPeriodStart] = useState<Date>(() =>
    schedulePeriod === 'custom' ? new Date() : startOfPeriod(new Date(), schedulePeriod),
  )

  // Reset to today whenever the preset changes.
  // Storing the previous value in state and comparing during render is the
  // React-recommended pattern for resetting derived state without useEffect.
  const [prevSchedulePeriod, setPrevSchedulePeriod] = useState(schedulePeriod)
  if (prevSchedulePeriod !== schedulePeriod) {
    setPrevSchedulePeriod(schedulePeriod)
    if (schedulePeriod !== 'custom') {
      setPeriodStart(startOfPeriod(new Date(), schedulePeriod))
    }
  }

  // ── Days in the current view ─────────────────────────────────────────────
  const days = useMemo<Date[]>(() => {
    if (schedulePeriod === 'custom') {
      if (!customPeriodStart || !customPeriodEnd) return []
      return periodDays(
        new Date(customPeriodStart + 'T00:00:00'),
        'custom',
        new Date(customPeriodEnd + 'T00:00:00'),
      )
    }
    return periodDays(periodStart, schedulePeriod)
  }, [schedulePeriod, periodStart, customPeriodStart, customPeriodEnd])

  // ── Modal / confirm state ─────────────────────────────────────────────────
  const [modalOpen, setModalOpen] = useState(false)
  const [prefill, setPrefill] = useState<{ date: string; shiftId: string } | null>(null)
  const [form, setForm] = useState<AssignFormData>({
    date: toISODate(new Date()),
    shiftId: '',
    workerId: '',
    notes: '',
  })
  const [deleteTarget, setDeleteTarget] = useState<Assignment | null>(null)
  const [editNotesTarget, setEditNotesTarget] = useState<Assignment | null>(null)
  const [editNotesValue, setEditNotesValue] = useState('')
  const [clearPeriodOpen, setClearPeriodOpen] = useState(false)
  const [copyPrevOpen, setCopyPrevOpen] = useState(false)
  const [autoFillOpen, setAutoFillOpen] = useState(false)
  const [autoFillResult, setAutoFillResult] = useState<AutoFillResult | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [bankHolidayOpen, setBankHolidayOpen] = useState(false)

  const bankHolidayDateSet = useMemo(() => new Set(bankHolidays.map((h) => h.date)), [bankHolidays])

  const bankHolidayByDate = useMemo(
    () => new Map(bankHolidays.map((h) => [h.date, h])),
    [bankHolidays],
  )

  // ── Drag-and-drop state ──────────────────────────────────────────────────
  const [drag, setDrag] = useState<DragState | null>(null)
  const [dropHover, setDropHover] = useState<string | null>(null)

  // ── Row-reorder drag state ───────────────────────────────────────────────
  const [rowDragIndex, setRowDragIndex] = useState<number | null>(null)
  const [rowDropIndex, setRowDropIndex] = useState<number | null>(null)

  // ── Sidebar filter state ─────────────────────────────────────────────────
  const [filterTagIds, setFilterTagIds] = useState<string[]>([])
  const [filterDayIndex, setFilterDayIndex] = useState<number | null>(null)
  const [filterTime, setFilterTime] = useState('')

  // ── Assignment modal helpers ─────────────────────────────────────────────

  const selectedShift = shifts.find((s) => s.id === form.shiftId)
  const requiredTags = selectedShift
    ? tags.filter((t) => selectedShift.requiredTagIds.includes(t.id))
    : []

  const alreadyAssignedIds = useMemo(
    () => new Set(store.getAssignmentsFor(form.date, form.shiftId).map((a) => a.workerId)),
    [store, form.date, form.shiftId],
  )
  const eligibleForShift = useMemo(
    () => (form.shiftId ? store.eligibleWorkers(form.shiftId) : workers),
    [form.shiftId, store, workers],
  )
  const eligible = useMemo(
    () => eligibleForShift.filter((w) => !alreadyAssignedIds.has(w.id)),
    [eligibleForShift, alreadyAssignedIds],
  )

  function availableFor(date: string, shiftId: string): Worker[] {
    const assigned = new Set(store.getAssignmentsFor(date, shiftId).map((a) => a.workerId))
    return store.eligibleWorkers(shiftId).filter((w) => !assigned.has(w.id))
  }

  function openAssign(date?: string, shiftId?: string) {
    const resolvedDate = date ?? toISODate(new Date())
    const resolvedShiftId = shiftId ?? shifts[0]?.id ?? ''
    const available = availableFor(resolvedDate, resolvedShiftId)
    setForm({
      date: resolvedDate,
      shiftId: resolvedShiftId,
      workerId: available[0]?.id ?? '',
      notes: '',
    })
    setPrefill(date && shiftId ? { date, shiftId } : null)
    setModalOpen(true)
  }

  function handleShiftChange(shiftId: string) {
    const available = availableFor(form.date, shiftId)
    setForm((f) => ({ ...f, shiftId, workerId: available[0]?.id ?? '' }))
  }

  function handleDateChange(date: string) {
    const available = availableFor(date, form.shiftId)
    setForm((f) => ({ ...f, date, workerId: available[0]?.id ?? '' }))
  }

  // ── Period data ──────────────────────────────────────────────────────────

  const periodDateStrings = useMemo(() => new Set(days.map(toISODate)), [days])
  const periodAssignments = useMemo(
    () => store.assignments.filter((a) => periodDateStrings.has(a.date)),
    [store.assignments, periodDateStrings],
  )

  // ── Copy previous period ─────────────────────────────────────────────────

  const prevPeriodCopyable = useMemo(() => {
    if (days.length === 0) return []

    // Build a mapping from previous-period date → current-period date by index
    let prevDays: Date[]
    if (schedulePeriod === 'custom') {
      // Shift back by the same number of days as the current custom range
      const offset = days.length
      prevDays = days.map((d) => {
        const prev = new Date(d)
        prev.setDate(prev.getDate() - offset)
        return prev
      })
    } else {
      const prevStart = addPeriod(periodStart, -1, schedulePeriod)
      prevDays = periodDays(prevStart, schedulePeriod)
    }

    const dateMap = new Map<string, string>()
    prevDays.forEach((d, i) => {
      if (i < days.length) dateMap.set(toISODate(d), toISODate(days[i]))
    })

    const currentKeys = new Set(
      periodAssignments.map((a) => `${a.date}:${a.shiftId}:${a.workerId}`),
    )

    return store.assignments
      .filter((a) => dateMap.has(a.date))
      .map((a) => ({ ...a, date: dateMap.get(a.date)! }))
      .filter((a) => !currentKeys.has(`${a.date}:${a.shiftId}:${a.workerId}`))
  }, [days, schedulePeriod, periodStart, periodAssignments, store.assignments])

  function runAutoFill() {
    const result = greedyAutoFill(
      days,
      shifts,
      workers,
      periodAssignments,
      bankHolidayDateSet,
      workerHolidays,
    )
    setAutoFillResult(result)
    setAutoFillOpen(true)
  }

  function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault()
    if (!form.date || !form.shiftId || !form.workerId) return
    store.addAssignment(form)
    setModalOpen(false)
  }

  // ── Sidebar filter logic ─────────────────────────────────────────────────

  function toggleFilterTag(tagId: string) {
    setFilterTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
    )
  }

  function toggleFilterDay(idx: number) {
    setFilterDayIndex((prev) => (prev === idx ? null : idx))
  }

  const hasActiveFilters = filterTagIds.length > 0 || filterDayIndex !== null || filterTime !== ''

  const filteredWorkers = useMemo(() => {
    return workers.filter((w) => {
      if (filterTagIds.length > 0 && !filterTagIds.every((tid) => w.tagIds.includes(tid)))
        return false

      if (filterDayIndex !== null) {
        const avail = w.availability[filterDayIndex]
        if (avail === null || avail === undefined) return false
        if (filterTime && (avail.start > filterTime || avail.end < filterTime)) return false
      } else if (filterTime) {
        const ok = w.availability.some(
          (a) => a !== null && a.start <= filterTime && a.end >= filterTime,
        )
        if (!ok) return false
      }

      return true
    })
  }, [workers, filterTagIds, filterDayIndex, filterTime])

  // ── Drag-and-drop logic ──────────────────────────────────────────────────

  const validDrops = useMemo<Set<string>>(() => {
    if (!drag) return new Set()
    const worker = workers.find((w) => w.id === drag.workerId)
    if (!worker) return new Set()

    const set = new Set<string>()
    for (const day of days) {
      const dateStr = toISODate(day)
      if (bankHolidayDateSet.has(dateStr)) continue
      for (const shift of shifts) {
        if (!shift.requiredTagIds.every((tid) => worker.tagIds.includes(tid))) continue
        const alreadyHere = store.assignments.some(
          (a) => a.date === dateStr && a.shiftId === shift.id && a.workerId === drag.workerId,
        )
        if (alreadyHere) continue
        set.add(`${dateStr}:${shift.id}`)
      }
    }
    return set
  }, [drag, days, shifts, workers, store.assignments, bankHolidayDateSet])

  function stopDrag() {
    setDrag(null)
    setDropHover(null)
    setRowDragIndex(null)
    setRowDropIndex(null)
  }

  function handleRowDragOver(e: React.DragEvent, index: number) {
    if (rowDragIndex === null) return
    e.preventDefault()
    setRowDropIndex(index)
  }

  function handleRowDrop(index: number) {
    if (rowDragIndex === null || rowDragIndex === index) {
      stopDrag()
      return
    }
    const reordered = [...shifts]
    const [moved] = reordered.splice(rowDragIndex, 1)
    reordered.splice(index, 0, moved)
    store.reorderShifts(reordered.map((s) => s.id))
    stopDrag()
  }

  function handleCellDragOver(e: React.DragEvent, key: string) {
    if (rowDragIndex !== null) return
    if (drag && validDrops.has(key)) {
      e.preventDefault()
      e.dataTransfer.dropEffect = drag.type === 'move' ? 'move' : 'copy'
      setDropHover(key)
    }
  }

  function handleCellDrop(e: React.DragEvent, dateStr: string, shiftId: string) {
    e.preventDefault()
    if (!drag || !validDrops.has(`${dateStr}:${shiftId}`)) {
      stopDrag()
      return
    }

    if (drag.type === 'move' && drag.assignmentId) {
      const original = store.assignments.find((a) => a.id === drag.assignmentId)
      store.deleteAssignment(drag.assignmentId)
      store.addAssignment({
        date: dateStr,
        shiftId,
        workerId: drag.workerId,
        notes: original?.notes ?? '',
      })
    } else {
      store.addAssignment({ date: dateStr, shiftId, workerId: drag.workerId, notes: '' })
    }
    stopDrag()
  }

  // ── Period label & navigation ─────────────────────────────────────────────

  const periodLabel =
    schedulePeriod === 'custom'
      ? formatPeriodRange(
          new Date(customPeriodStart + 'T00:00:00'),
          'custom',
          new Date(customPeriodEnd + 'T00:00:00'),
        )
      : formatPeriodRange(periodStart, schedulePeriod)

  // ── Render ───────────────────────────────────────────────────────────────

  if (shifts.length === 0) {
    return (
      <div className="view-container">
        <p className="empty-hint">
          No shift types defined yet. Go to <strong>Shift Types</strong> to add some.
        </p>
      </div>
    )
  }

  return (
    <div className="view-container">
      {/* ── Period selector ── */}
      <div className="period-selector">
        {(Object.keys(PERIOD_LABELS) as SchedulePeriodPreset[]).map((preset) => (
          <button
            key={preset}
            className={`period-btn${schedulePeriod === preset ? ' period-btn--active' : ''}`}
            onClick={() => setSchedulePeriod(preset)}
          >
            {PERIOD_LABELS[preset]}
          </button>
        ))}
        {schedulePeriod === 'custom' && (
          <div className="period-custom-range">
            <input
              type="date"
              className="form__input form__input--date"
              value={customPeriodStart}
              max={customPeriodEnd}
              onChange={(e) => setCustomPeriod(e.target.value, customPeriodEnd)}
            />
            <span className="period-custom-range__sep">–</span>
            <input
              type="date"
              className="form__input form__input--date"
              value={customPeriodEnd}
              min={customPeriodStart}
              onChange={(e) => setCustomPeriod(customPeriodStart, e.target.value)}
            />
          </div>
        )}
      </div>

      <div className="view-toolbar">
        {schedulePeriod !== 'custom' && (
          <>
            <button
              className="btn btn--ghost btn--icon"
              onClick={() => setPeriodStart((p) => addPeriod(p, -1, schedulePeriod))}
            >
              ←
            </button>
            <h2 className="week-label">{periodLabel}</h2>
            <button
              className="btn btn--ghost btn--icon"
              onClick={() => setPeriodStart((p) => addPeriod(p, 1, schedulePeriod))}
            >
              →
            </button>
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => setPeriodStart(startOfPeriod(new Date(), schedulePeriod))}
            >
              Today
            </button>
          </>
        )}
        {schedulePeriod === 'custom' && <h2 className="week-label">{periodLabel}</h2>}
        <div className="spacer" />
        {periodAssignments.length > 0 && (
          <button
            className="btn btn--ghost btn--danger-text"
            onClick={() => setClearPeriodOpen(true)}
          >
            Clear period
          </button>
        )}
        {prevPeriodCopyable.length > 0 && (
          <button className="btn btn--ghost" onClick={() => setCopyPrevOpen(true)}>
            Copy prev period
          </button>
        )}
        <button className="btn btn--ghost" onClick={() => setBankHolidayOpen(true)}>
          🗓 Holidays
        </button>
        <button className="btn btn--ghost" onClick={runAutoFill}>
          ⚡ Auto-fill
        </button>
        <button className="btn btn--ghost" onClick={() => setExportOpen(true)}>
          ↓ Export
        </button>
        <button className="btn btn--primary" onClick={() => openAssign()}>
          + Assign
        </button>
      </div>

      <div
        className={`schedule-layout${days.length > 7 ? ' schedule-layout--wide' : ''}`}
        onDragEnd={stopDrag}
      >
        {/* ── Schedule table ── */}
        <div className="schedule-main">
          <div className="schedule-wrapper">
            <table className="schedule-table">
              <thead>
                <tr>
                  <th className="schedule-table__corner">Shift</th>
                  {days.map((d) => {
                    const dateStr = toISODate(d)
                    const holiday = bankHolidayByDate.get(dateStr)
                    return (
                      <th
                        key={d.toISOString()}
                        className={[
                          'schedule-table__day-head',
                          isToday(d) ? 'schedule-table__day-head--today' : '',
                          holiday ? 'schedule-table__day-head--holiday' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        {formatDayHeader(d)}
                        {holiday && <span className="day-head-holiday-label">{holiday.name}</span>}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {shifts.map((shift, i) => {
                  const shiftReqTags = tags.filter((t) => shift.requiredTagIds.includes(t.id))
                  const isRowDropTarget = rowDropIndex === i && rowDragIndex !== i
                  return (
                    <tr
                      key={shift.id}
                      className={isRowDropTarget ? 'schedule-row--drop-target' : undefined}
                      onDragOver={(e) => handleRowDragOver(e, i)}
                      onDrop={() => handleRowDrop(i)}
                    >
                      <td className="schedule-table__shift-cell">
                        <span
                          className="shift-row-handle"
                          title="Drag to reorder"
                          draggable
                          onDragStart={(e) => {
                            e.stopPropagation()
                            setRowDragIndex(i)
                          }}
                          onDragEnd={stopDrag}
                        >
                          ⠿
                        </span>
                        <span className="shift-label" style={{ borderLeftColor: shift.color }}>
                          <strong>{shift.name}</strong>
                          <span className="shift-label__time">
                            {shift.start}–{shift.end}
                          </span>
                          {shiftReqTags.length > 0 && (
                            <div className="shift-label__tags">
                              {shiftReqTags.map((t) => (
                                <TagBadge key={t.id} tag={t} size="sm" />
                              ))}
                            </div>
                          )}
                        </span>
                      </td>
                      {days.map((day) => {
                        const dateStr = toISODate(day)
                        const isHoliday = bankHolidayDateSet.has(dateStr)
                        const cellKey = `${dateStr}:${shift.id}`
                        const isValid = drag ? validDrops.has(cellKey) : null
                        const isHovered = dropHover === cellKey

                        const cellAssignments = store.getAssignmentsFor(dateStr, shift.id)
                        const cellWorkers = cellAssignments
                          .map((a) => ({
                            assignment: a,
                            worker: workers.find((w) => w.id === a.workerId),
                          }))
                          .filter(
                            (x): x is { assignment: Assignment; worker: Worker } =>
                              x.worker !== undefined,
                          )

                        let cellClass = 'schedule-table__cell'
                        if (isToday(day)) cellClass += ' schedule-table__cell--today'
                        if (isHoliday) cellClass += ' schedule-table__cell--holiday'
                        else if (drag) {
                          if (isHovered) cellClass += ' cell--drop-hover'
                          else if (isValid) cellClass += ' cell--drop-valid'
                          else cellClass += ' cell--drop-invalid'
                        }

                        return (
                          <td
                            key={dateStr}
                            className={cellClass}
                            onClick={() => !drag && !isHoliday && openAssign(dateStr, shift.id)}
                            onDragOver={(e) => !isHoliday && handleCellDragOver(e, cellKey)}
                            onDragLeave={(e) => {
                              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                                setDropHover(null)
                              }
                            }}
                            onDrop={(e) => !isHoliday && handleCellDrop(e, dateStr, shift.id)}
                          >
                            <div className="cell-content">
                              {isHoliday ? (
                                <span className="cell-holiday-overlay">Holiday</span>
                              ) : (
                                <>
                                  {cellWorkers.map(({ assignment, worker }) => (
                                    <span
                                      key={assignment.id}
                                      draggable
                                      className={`badge-drag-wrapper${drag?.assignmentId === assignment.id ? ' badge-drag-wrapper--dragging' : ''}`}
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        if (!drag) {
                                          setEditNotesTarget(assignment)
                                          setEditNotesValue(assignment.notes ?? '')
                                        }
                                      }}
                                      onDragStart={(e) => {
                                        e.stopPropagation()
                                        e.dataTransfer.effectAllowed = 'move'
                                        setDrag({
                                          type: 'move',
                                          workerId: worker.id,
                                          assignmentId: assignment.id,
                                        })
                                      }}
                                      onDragEnd={stopDrag}
                                    >
                                      <WorkerBadge
                                        worker={worker}
                                        onRemove={
                                          drag ? undefined : () => setDeleteTarget(assignment)
                                        }
                                      />
                                      {assignment.notes && (
                                        <span className="assignment-notes">{assignment.notes}</span>
                                      )}
                                    </span>
                                  ))}
                                  {!drag && <span className="cell-add-hint">+</span>}
                                  {drag && isValid && !isHovered && (
                                    <span className="cell-drop-hint">+</span>
                                  )}
                                  {drag && isHovered && (
                                    <span className="cell-drop-hint cell-drop-hint--active">
                                      Drop
                                    </span>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Workers sidebar ── */}
        {workers.length > 0 && (
          <aside className="workers-sidebar">
            <div className="workers-sidebar__header">
              <span>Workers</span>
              {hasActiveFilters && (
                <button
                  className="workers-sidebar__clear"
                  onClick={() => {
                    setFilterTagIds([])
                    setFilterDayIndex(null)
                    setFilterTime('')
                  }}
                >
                  Clear
                </button>
              )}
            </div>

            {tags.length > 0 && (
              <div className="sidebar-section sidebar-section--tags">
                <div className="sidebar-section__label">Tag</div>
                <div className="sidebar-filter-tags">
                  {tags.map((t) => {
                    const active = filterTagIds.includes(t.id)
                    return (
                      <button
                        key={t.id}
                        className={`tag-toggle tag-toggle--sm ${active ? 'tag-toggle--active' : ''}`}
                        style={
                          active
                            ? {
                                backgroundColor: t.color + '22',
                                borderColor: t.color,
                                color: t.color,
                              }
                            : {}
                        }
                        onClick={() => toggleFilterTag(t.id)}
                      >
                        {t.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="sidebar-section sidebar-section--days">
              <div className="sidebar-section__label">Day</div>
              <div className="day-filter">
                {DAY_LABELS.map((label, i) => (
                  <button
                    key={i}
                    className={`day-btn${filterDayIndex === i ? ' day-btn--active' : ''}`}
                    onClick={() => toggleFilterDay(i)}
                    title={
                      [
                        'Monday',
                        'Tuesday',
                        'Wednesday',
                        'Thursday',
                        'Friday',
                        'Saturday',
                        'Sunday',
                      ][i]
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="sidebar-section sidebar-section--time">
              <div className="sidebar-section__label">Time</div>
              <div className="sidebar-time-filter">
                <input
                  type="time"
                  className="form__input form__input--time"
                  value={filterTime}
                  onChange={(e) => setFilterTime(e.target.value)}
                />
                {filterTime && (
                  <button
                    className="btn btn--ghost btn--sm btn--icon"
                    onClick={() => setFilterTime('')}
                    title="Clear time"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            <div className="workers-sidebar__chips">
              {filteredWorkers.length === 0 ? (
                <p className="workers-sidebar__empty">No workers match</p>
              ) : (
                filteredWorkers.map((w) => {
                  const workerTags = tags.filter((t) => w.tagIds.includes(t.id))
                  const isDraggingThis = drag?.workerId === w.id && drag.type === 'new'
                  return (
                    <div
                      key={w.id}
                      draggable
                      className={`worker-chip worker-chip--block${isDraggingThis ? ' worker-chip--dragging' : ''}`}
                      style={{
                        backgroundColor: w.color + '22',
                        borderColor: w.color,
                        color: w.color,
                      }}
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'copy'
                        setDrag({ type: 'new', workerId: w.id })
                      }}
                      onDragEnd={stopDrag}
                    >
                      <span className="worker-chip__dot" style={{ backgroundColor: w.color }} />
                      <span className="worker-chip__name">{w.name}</span>
                      {workerTags.length > 0 && (
                        <div className="worker-chip__tags">
                          {workerTags.map((t) => (
                            <span
                              key={t.id}
                              className="worker-chip__tag-dot"
                              style={{ backgroundColor: t.color }}
                              title={t.name}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>

            <div className="workers-sidebar__hint">Drag into schedule to assign</div>
          </aside>
        )}
      </div>

      {/* ── Modals ── */}
      <Modal
        title={prefill ? 'Assign Worker' : 'New Assignment'}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      >
        <form onSubmit={handleSubmit} className="form">
          <label className="form__label">
            Date *
            <input
              className="form__input"
              type="date"
              value={form.date}
              onChange={(e) => handleDateChange(e.target.value)}
              required
            />
          </label>
          <label className="form__label">
            Shift Type *
            <select
              className="form__input"
              value={form.shiftId}
              onChange={(e) => handleShiftChange(e.target.value)}
              required
            >
              <option value="">— select —</option>
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.start}–{s.end})
                </option>
              ))}
            </select>
          </label>

          {requiredTags.length > 0 && (
            <div className="assign-tag-notice">
              <span className="assign-tag-notice__label">Required tags:</span>
              {requiredTags.map((t) => (
                <TagBadge key={t.id} tag={t} size="sm" />
              ))}
            </div>
          )}

          <label className="form__label">
            Worker *
            {eligible.length === 0 ? (
              <p className={eligibleForShift.length === 0 ? 'form__warning' : 'form__hint'}>
                {eligibleForShift.length === 0
                  ? 'No workers have the required tags for this shift. Add tags to workers first.'
                  : 'All available workers are already assigned to this shift.'}
              </p>
            ) : (
              <select
                className="form__input"
                value={form.workerId}
                onChange={(e) => setForm((f) => ({ ...f, workerId: e.target.value }))}
                required
              >
                <option value="">— select —</option>
                {eligible.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                    {w.role ? ` — ${w.role}` : ''}
                  </option>
                ))}
              </select>
            )}
          </label>

          <label className="form__label">
            Notes
            <input
              className="form__input"
              type="text"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Optional note"
            />
          </label>
          <div className="form__footer">
            <button type="button" className="btn btn--ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary" disabled={eligible.length === 0}>
              Save
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        message="Remove this assignment?"
        onConfirm={() => deleteTarget && store.deleteAssignment(deleteTarget.id)}
        onClose={() => setDeleteTarget(null)}
      />

      <Modal
        title="Edit Notes"
        open={editNotesTarget !== null}
        onClose={() => setEditNotesTarget(null)}
        size="sm"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (editNotesTarget) store.updateAssignmentNotes(editNotesTarget.id, editNotesValue)
            setEditNotesTarget(null)
          }}
          className="form"
        >
          <label className="form__label">
            Notes
            <input
              className="form__input"
              type="text"
              value={editNotesValue}
              onChange={(e) => setEditNotesValue(e.target.value)}
              placeholder="Optional note"
              autoFocus
            />
          </label>
          <div className="form__footer">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setEditNotesTarget(null)}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn--primary">
              Save
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={clearPeriodOpen}
        message={`Remove all ${periodAssignments.length} assignment${periodAssignments.length === 1 ? '' : 's'} for this period?`}
        onConfirm={() => store.deleteAssignmentsForDates(days.map(toISODate))}
        onClose={() => setClearPeriodOpen(false)}
      />

      <ConfirmDialog
        open={copyPrevOpen}
        message={`Copy ${prevPeriodCopyable.length} assignment${prevPeriodCopyable.length === 1 ? '' : 's'} from the previous period?`}
        onConfirm={() => store.addAssignments(prevPeriodCopyable)}
        onClose={() => setCopyPrevOpen(false)}
      />

      <AutoFillModal
        open={autoFillOpen}
        result={autoFillResult}
        workers={workers}
        shifts={shifts}
        onConfirm={() => autoFillResult && store.addAssignments(autoFillResult.assignments)}
        onClose={() => setAutoFillOpen(false)}
      />

      <ExportModal
        open={exportOpen}
        defaultStart={days.length > 0 ? toISODate(days[0]) : toISODate(new Date())}
        defaultEnd={days.length > 0 ? toISODate(days[days.length - 1]) : toISODate(new Date())}
        assignments={store.assignments}
        workers={workers}
        shifts={shifts}
        tags={tags}
        onClose={() => setExportOpen(false)}
      />

      <BankHolidayModal
        open={bankHolidayOpen}
        bankHolidays={bankHolidays}
        store={store}
        onClose={() => setBankHolidayOpen(false)}
      />
    </div>
  )
}
