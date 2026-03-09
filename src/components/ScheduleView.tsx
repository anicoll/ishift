import { useState, useMemo } from 'react';
import type { Tag, Worker, ShiftType, Assignment, BankHoliday, WorkerHoliday } from '../types';
import type { Store } from '../store/useStore';
import {
  startOfWeek, weekDays, toISODate,
  formatDayHeader, formatWeekRange, isToday, addWeeks,
} from '../utils/dates';
import { greedyAutoFill, type AutoFillResult } from '../utils/autofill';
import { WorkerBadge } from './WorkerBadge';
import { TagBadge } from './TagBadge';
import { Modal } from './Modal';
import { ConfirmDialog } from './ConfirmDialog';
import { AutoFillModal } from './AutoFillModal';
import { ExportModal } from './ExportModal';
import { BankHolidayModal } from './BankHolidayModal';

// 0 = Monday … 6 = Sunday
const DAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

interface Props {
  workers: Worker[];
  shifts: ShiftType[];
  tags: Tag[];
  bankHolidays: BankHoliday[];
  workerHolidays: WorkerHoliday[];
  store: Pick<Store, 'addAssignment' | 'addAssignments' | 'deleteAssignment' | 'deleteAssignmentsForDates' | 'getAssignmentsFor' | 'eligibleWorkers' | 'assignments' | 'reorderShifts' | 'addBankHoliday' | 'deleteBankHoliday'>;
}

interface AssignFormData {
  date: string;
  shiftId: string;
  workerId: string;
  notes: string;
}

interface DragState {
  type: 'new' | 'move';
  workerId: string;
  /** ID of the assignment being moved (only set when type === 'move'). */
  assignmentId?: string;
}

export function ScheduleView({ workers, shifts, tags, bankHolidays, workerHolidays, store }: Props) {
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [modalOpen, setModalOpen] = useState(false);
  const [prefill, setPrefill] = useState<{ date: string; shiftId: string } | null>(null);
  const [form, setForm] = useState<AssignFormData>({
    date: toISODate(new Date()),
    shiftId: '',
    workerId: '',
    notes: '',
  });
  const [deleteTarget, setDeleteTarget] = useState<Assignment | null>(null);
  const [clearWeekOpen, setClearWeekOpen] = useState(false);
  const [copyPrevWeekOpen, setCopyPrevWeekOpen] = useState(false);
  const [autoFillOpen, setAutoFillOpen] = useState(false);
  const [autoFillResult, setAutoFillResult] = useState<AutoFillResult | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [bankHolidayOpen, setBankHolidayOpen] = useState(false);

  const bankHolidayDateSet = useMemo(
    () => new Set(bankHolidays.map(h => h.date)),
    [bankHolidays],
  );

  const bankHolidayByDate = useMemo(
    () => new Map(bankHolidays.map(h => [h.date, h])),
    [bankHolidays],
  );

  // ── Drag-and-drop state ──────────────────────────────────────────────────
  const [drag, setDrag] = useState<DragState | null>(null);
  const [dropHover, setDropHover] = useState<string | null>(null); // "date:shiftId"

  // ── Row-reorder drag state ───────────────────────────────────────────────
  const [rowDragIndex, setRowDragIndex] = useState<number | null>(null);
  const [rowDropIndex, setRowDropIndex] = useState<number | null>(null);

  // ── Sidebar filter state ─────────────────────────────────────────────────
  const [filterTagIds, setFilterTagIds] = useState<string[]>([]);
  const [filterDayIndex, setFilterDayIndex] = useState<number | null>(null);
  const [filterTime, setFilterTime] = useState('');

  const days = weekDays(weekStart);

  // ── Assignment modal helpers ─────────────────────────────────────────────

  const selectedShift = shifts.find(s => s.id === form.shiftId);
  const requiredTags = selectedShift
    ? tags.filter(t => selectedShift.requiredTagIds.includes(t.id))
    : [];

  const alreadyAssignedIds = useMemo(
    () => new Set(store.getAssignmentsFor(form.date, form.shiftId).map(a => a.workerId)),
    [store, form.date, form.shiftId],
  );
  const eligible = useMemo(
    () => (form.shiftId ? store.eligibleWorkers(form.shiftId) : workers)
      .filter(w => !alreadyAssignedIds.has(w.id)),
    [form.shiftId, store, workers, alreadyAssignedIds],
  );

  function availableFor(date: string, shiftId: string): Worker[] {
    const assigned = new Set(store.getAssignmentsFor(date, shiftId).map(a => a.workerId));
    return store.eligibleWorkers(shiftId).filter(w => !assigned.has(w.id));
  }

  function openAssign(date?: string, shiftId?: string) {
    const resolvedDate = date ?? toISODate(new Date());
    const resolvedShiftId = shiftId ?? shifts[0]?.id ?? '';
    const available = availableFor(resolvedDate, resolvedShiftId);
    setForm({
      date: resolvedDate,
      shiftId: resolvedShiftId,
      workerId: available[0]?.id ?? '',
      notes: '',
    });
    setPrefill(date && shiftId ? { date, shiftId } : null);
    setModalOpen(true);
  }

  function handleShiftChange(shiftId: string) {
    const available = availableFor(form.date, shiftId);
    setForm(f => ({ ...f, shiftId, workerId: available[0]?.id ?? '' }));
  }

  function handleDateChange(date: string) {
    const available = availableFor(date, form.shiftId);
    setForm(f => ({ ...f, date, workerId: available[0]?.id ?? '' }));
  }

  // ── Week data ────────────────────────────────────────────────────────────

  const weekDateStrings = useMemo(() => new Set(days.map(toISODate)), [days]);
  const weekAssignments = useMemo(
    () => store.assignments.filter(a => weekDateStrings.has(a.date)),
    [store.assignments, weekDateStrings],
  );

  // ── Copy previous week ───────────────────────────────────────────────────

  const prevWeekCopyable = useMemo(() => {
    const prevWeekDays = weekDays(addWeeks(weekStart, -1));
    const prevWeekDateStrings = new Set(prevWeekDays.map(toISODate));
    const currentWeekKeys = new Set(
      store.assignments
        .filter(a => weekDateStrings.has(a.date))
        .map(a => `${a.date}:${a.shiftId}:${a.workerId}`),
    );
    return store.assignments
      .filter(a => prevWeekDateStrings.has(a.date))
      .map(a => ({ ...a, date: toISODate(addWeeks(new Date(a.date), 1)) }))
      .filter(a => !currentWeekKeys.has(`${a.date}:${a.shiftId}:${a.workerId}`));
  }, [weekStart, store.assignments, weekDateStrings]);

  function runAutoFill() {
    const result = greedyAutoFill(weekStart, shifts, workers, weekAssignments, bankHolidayDateSet, workerHolidays);
    setAutoFillResult(result);
    setAutoFillOpen(true);
  }

  function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!form.date || !form.shiftId || !form.workerId) return;
    store.addAssignment(form);
    setModalOpen(false);
  }

  // ── Sidebar filter logic ──────────────────────────────────────────────────

  function toggleFilterTag(tagId: string) {
    setFilterTagIds(prev =>
      prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId],
    );
  }

  function toggleFilterDay(idx: number) {
    setFilterDayIndex(prev => (prev === idx ? null : idx));
  }

  const hasActiveFilters = filterTagIds.length > 0 || filterDayIndex !== null || filterTime !== '';

  const filteredWorkers = useMemo(() => {
    return workers.filter(w => {
      // Tag filter: worker must hold every selected tag
      if (filterTagIds.length > 0 && !filterTagIds.every(tid => w.tagIds.includes(tid))) return false;

      // Day + time filters combine against worker availability
      if (filterDayIndex !== null) {
        const avail = w.availability[filterDayIndex];
        if (avail === null || avail === undefined) return false;
        if (filterTime && (avail.start > filterTime || avail.end < filterTime)) return false;
      } else if (filterTime) {
        // No day selected: pass if available at this time on at least one day
        const ok = w.availability.some(a => a !== null && a.start <= filterTime && a.end >= filterTime);
        if (!ok) return false;
      }

      return true;
    });
  }, [workers, filterTagIds, filterDayIndex, filterTime]);

  // ── Drag-and-drop logic ──────────────────────────────────────────────────

  const validDrops = useMemo<Set<string>>(() => {
    if (!drag) return new Set();
    const worker = workers.find(w => w.id === drag.workerId);
    if (!worker) return new Set();

    const set = new Set<string>();
    for (const day of days) {
      const dateStr = toISODate(day);
      if (bankHolidayDateSet.has(dateStr)) continue;
      for (const shift of shifts) {
        if (!shift.requiredTagIds.every(tid => worker.tagIds.includes(tid))) continue;
        const alreadyHere = store.assignments.some(
          a => a.date === dateStr && a.shiftId === shift.id && a.workerId === drag.workerId,
        );
        if (alreadyHere) continue;
        set.add(`${dateStr}:${shift.id}`);
      }
    }
    return set;
  }, [drag, days, shifts, workers, store.assignments]);

  function stopDrag() {
    setDrag(null);
    setDropHover(null);
    setRowDragIndex(null);
    setRowDropIndex(null);
  }

  function handleRowDragOver(e: React.DragEvent, index: number) {
    if (rowDragIndex === null) return;
    e.preventDefault();
    setRowDropIndex(index);
  }

  function handleRowDrop(index: number) {
    if (rowDragIndex === null || rowDragIndex === index) { stopDrag(); return; }
    const reordered = [...shifts];
    const [moved] = reordered.splice(rowDragIndex, 1);
    reordered.splice(index, 0, moved);
    store.reorderShifts(reordered.map(s => s.id));
    stopDrag();
  }

  function handleCellDragOver(e: React.DragEvent, key: string) {
    if (rowDragIndex !== null) return; // row reorder in progress
    if (drag && validDrops.has(key)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = drag.type === 'move' ? 'move' : 'copy';
      setDropHover(key);
    }
  }

  function handleCellDrop(e: React.DragEvent, dateStr: string, shiftId: string) {
    e.preventDefault();
    if (!drag || !validDrops.has(`${dateStr}:${shiftId}`)) { stopDrag(); return; }

    if (drag.type === 'move' && drag.assignmentId) {
      const original = store.assignments.find(a => a.id === drag.assignmentId);
      store.deleteAssignment(drag.assignmentId);
      store.addAssignment({ date: dateStr, shiftId, workerId: drag.workerId, notes: original?.notes ?? '' });
    } else {
      store.addAssignment({ date: dateStr, shiftId, workerId: drag.workerId, notes: '' });
    }
    stopDrag();
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (shifts.length === 0) {
    return (
      <div className="view-container">
        <p className="empty-hint">
          No shift types defined yet. Go to <strong>Shift Types</strong> to add some.
        </p>
      </div>
    );
  }

  return (
    <div className="view-container">
      <div className="view-toolbar">
        <button className="btn btn--ghost btn--icon" onClick={() => setWeekStart(w => addWeeks(w, -1))}>
          ←
        </button>
        <h2 className="week-label">{formatWeekRange(weekStart)}</h2>
        <button className="btn btn--ghost btn--icon" onClick={() => setWeekStart(w => addWeeks(w, 1))}>
          →
        </button>
        <button className="btn btn--ghost btn--sm" onClick={() => setWeekStart(startOfWeek(new Date()))}>
          Today
        </button>
        <div className="spacer" />
        {weekAssignments.length > 0 && (
          <button className="btn btn--ghost btn--danger-text" onClick={() => setClearWeekOpen(true)}>
            Clear week
          </button>
        )}
        {prevWeekCopyable.length > 0 && (
          <button className="btn btn--ghost" onClick={() => setCopyPrevWeekOpen(true)}>
            Copy prev week
          </button>
        )}
        <button className="btn btn--ghost" onClick={() => setBankHolidayOpen(true)}>🗓 Holidays</button>
        <button className="btn btn--ghost" onClick={runAutoFill}>⚡ Auto-fill</button>
        <button className="btn btn--ghost" onClick={() => setExportOpen(true)}>↓ Export</button>
        <button className="btn btn--primary" onClick={() => openAssign()}>+ Assign</button>
      </div>

      <div className="schedule-layout" onDragEnd={stopDrag}>
        {/* ── Schedule table ── */}
        <div className="schedule-main">
          <div className="schedule-wrapper">
            <table className="schedule-table">
              <thead>
                <tr>
                  <th className="schedule-table__corner">Shift</th>
                  {days.map(d => {
                    const dateStr = toISODate(d);
                    const holiday = bankHolidayByDate.get(dateStr);
                    return (
                      <th
                        key={d.toISOString()}
                        className={[
                          'schedule-table__day-head',
                          isToday(d) ? 'schedule-table__day-head--today' : '',
                          holiday ? 'schedule-table__day-head--holiday' : '',
                        ].filter(Boolean).join(' ')}
                      >
                        {formatDayHeader(d)}
                        {holiday && (
                          <span className="day-head-holiday-label">{holiday.name}</span>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {shifts.map((shift, i) => {
                  const shiftReqTags = tags.filter(t => shift.requiredTagIds.includes(t.id));
                  const isRowDropTarget = rowDropIndex === i && rowDragIndex !== i;
                  return (
                    <tr
                      key={shift.id}
                      className={isRowDropTarget ? 'schedule-row--drop-target' : undefined}
                      onDragOver={e => handleRowDragOver(e, i)}
                      onDrop={() => handleRowDrop(i)}
                    >
                      <td className="schedule-table__shift-cell">
                        <span
                          className="shift-row-handle"
                          title="Drag to reorder"
                          draggable
                          onDragStart={e => { e.stopPropagation(); setRowDragIndex(i); }}
                          onDragEnd={stopDrag}
                        >⠿</span>
                        <span className="shift-label" style={{ borderLeftColor: shift.color }}>
                          <strong>{shift.name}</strong>
                          <span className="shift-label__time">{shift.start}–{shift.end}</span>
                          {shiftReqTags.length > 0 && (
                            <div className="shift-label__tags">
                              {shiftReqTags.map(t => <TagBadge key={t.id} tag={t} size="sm" />)}
                            </div>
                          )}
                        </span>
                      </td>
                      {days.map(day => {
                        const dateStr = toISODate(day);
                        const isHoliday = bankHolidayDateSet.has(dateStr);
                        const cellKey = `${dateStr}:${shift.id}`;
                        const isValid = drag ? validDrops.has(cellKey) : null;
                        const isHovered = dropHover === cellKey;

                        const cellAssignments = store.getAssignmentsFor(dateStr, shift.id);
                        const cellWorkers = cellAssignments
                          .map(a => ({ assignment: a, worker: workers.find(w => w.id === a.workerId) }))
                          .filter((x): x is { assignment: Assignment; worker: Worker } => x.worker !== undefined);

                        let cellClass = 'schedule-table__cell';
                        if (isToday(day)) cellClass += ' schedule-table__cell--today';
                        if (isHoliday) cellClass += ' schedule-table__cell--holiday';
                        else if (drag) {
                          if (isHovered) cellClass += ' cell--drop-hover';
                          else if (isValid) cellClass += ' cell--drop-valid';
                          else cellClass += ' cell--drop-invalid';
                        }

                        return (
                          <td
                            key={dateStr}
                            className={cellClass}
                            onClick={() => !drag && !isHoliday && openAssign(dateStr, shift.id)}
                            onDragOver={e => !isHoliday && handleCellDragOver(e, cellKey)}
                            onDragLeave={e => {
                              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                                setDropHover(null);
                              }
                            }}
                            onDrop={e => !isHoliday && handleCellDrop(e, dateStr, shift.id)}
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
                                      onClick={e => e.stopPropagation()}
                                      onDragStart={(e) => {
                                        e.stopPropagation();
                                        e.dataTransfer.effectAllowed = 'move';
                                        setDrag({ type: 'move', workerId: worker.id, assignmentId: assignment.id });
                                      }}
                                      onDragEnd={stopDrag}
                                    >
                                      <WorkerBadge
                                        worker={worker}
                                        onRemove={drag ? undefined : () => setDeleteTarget(assignment)}
                                      />
                                    </span>
                                  ))}
                                  {!drag && <span className="cell-add-hint">+</span>}
                                  {drag && isValid && !isHovered && <span className="cell-drop-hint">+</span>}
                                  {drag && isHovered && <span className="cell-drop-hint cell-drop-hint--active">Drop</span>}
                                </>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
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
                  onClick={() => { setFilterTagIds([]); setFilterDayIndex(null); setFilterTime(''); }}
                >
                  Clear
                </button>
              )}
            </div>

            {/* Tag filter */}
            {tags.length > 0 && (
              <div className="sidebar-section">
                <div className="sidebar-section__label">Tag</div>
                <div className="sidebar-filter-tags">
                  {tags.map(t => {
                    const active = filterTagIds.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        className={`tag-toggle tag-toggle--sm ${active ? 'tag-toggle--active' : ''}`}
                        style={active ? { backgroundColor: t.color + '22', borderColor: t.color, color: t.color } : {}}
                        onClick={() => toggleFilterTag(t.id)}
                      >
                        {t.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Day filter */}
            <div className="sidebar-section">
              <div className="sidebar-section__label">Day</div>
              <div className="day-filter">
                {DAY_LABELS.map((label, i) => (
                  <button
                    key={i}
                    className={`day-btn${filterDayIndex === i ? ' day-btn--active' : ''}`}
                    onClick={() => toggleFilterDay(i)}
                    title={['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][i]}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Time filter */}
            <div className="sidebar-section">
              <div className="sidebar-section__label">Time</div>
              <div className="sidebar-time-filter">
                <input
                  type="time"
                  className="form__input form__input--time"
                  value={filterTime}
                  onChange={e => setFilterTime(e.target.value)}
                />
                {filterTime && (
                  <button className="btn btn--ghost btn--sm btn--icon" onClick={() => setFilterTime('')} title="Clear time">×</button>
                )}
              </div>
            </div>

            {/* Worker chips */}
            <div className="workers-sidebar__chips">
              {filteredWorkers.length === 0 ? (
                <p className="workers-sidebar__empty">No workers match</p>
              ) : (
                filteredWorkers.map(w => {
                  const workerTags = tags.filter(t => w.tagIds.includes(t.id));
                  const isDraggingThis = drag?.workerId === w.id && drag.type === 'new';
                  return (
                    <div
                      key={w.id}
                      draggable
                      className={`worker-chip worker-chip--block${isDraggingThis ? ' worker-chip--dragging' : ''}`}
                      style={{ backgroundColor: w.color + '22', borderColor: w.color, color: w.color }}
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'copy';
                        setDrag({ type: 'new', workerId: w.id });
                      }}
                      onDragEnd={stopDrag}
                    >
                      <span className="worker-chip__dot" style={{ backgroundColor: w.color }} />
                      <span className="worker-chip__name">{w.name}</span>
                      {workerTags.length > 0 && (
                        <div className="worker-chip__tags">
                          {workerTags.map(t => (
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
                  );
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
              onChange={e => handleDateChange(e.target.value)}
              required
            />
          </label>
          <label className="form__label">
            Shift Type *
            <select
              className="form__input"
              value={form.shiftId}
              onChange={e => handleShiftChange(e.target.value)}
              required
            >
              <option value="">— select —</option>
              {shifts.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.start}–{s.end})</option>
              ))}
            </select>
          </label>

          {requiredTags.length > 0 && (
            <div className="assign-tag-notice">
              <span className="assign-tag-notice__label">Required tags:</span>
              {requiredTags.map(t => <TagBadge key={t.id} tag={t} size="sm" />)}
            </div>
          )}

          <label className="form__label">
            Worker *
            {eligible.length === 0 ? (
              <p className="form__warning">
                No workers have the required tags for this shift. Add tags to workers first.
              </p>
            ) : (
              <select
                className="form__input"
                value={form.workerId}
                onChange={e => setForm(f => ({ ...f, workerId: e.target.value }))}
                required
              >
                <option value="">— select —</option>
                {eligible.map(w => (
                  <option key={w.id} value={w.id}>
                    {w.name}{w.role ? ` — ${w.role}` : ''}
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
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
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

      <ConfirmDialog
        open={clearWeekOpen}
        message={`Remove all ${weekAssignments.length} assignment${weekAssignments.length === 1 ? '' : 's'} for this week?`}
        onConfirm={() => store.deleteAssignmentsForDates(days.map(toISODate))}
        onClose={() => setClearWeekOpen(false)}
      />

      <ConfirmDialog
        open={copyPrevWeekOpen}
        message={`Copy ${prevWeekCopyable.length} assignment${prevWeekCopyable.length === 1 ? '' : 's'} from the previous week?`}
        onConfirm={() => store.addAssignments(prevWeekCopyable)}
        onClose={() => setCopyPrevWeekOpen(false)}
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
        defaultStart={toISODate(weekStart)}
        defaultEnd={toISODate(days[6])}
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
  );
}
