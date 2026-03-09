import { useState } from 'react';
import type { Tag, Worker, ShiftType, Assignment } from '../types';
import type { Store } from '../store/useStore';
import {
  startOfWeek, weekDays, toISODate,
  formatDayHeader, formatWeekRange, isToday, addWeeks,
} from '../utils/dates';
import { WorkerBadge } from './WorkerBadge';
import { TagBadge } from './TagBadge';
import { Modal } from './Modal';
import { ConfirmDialog } from './ConfirmDialog';

interface Props {
  workers: Worker[];
  shifts: ShiftType[];
  tags: Tag[];
  store: Pick<Store, 'addAssignment' | 'deleteAssignment' | 'getAssignmentsFor' | 'eligibleWorkers'>;
}

interface AssignFormData {
  date: string;
  shiftId: string;
  workerId: string;
  notes: string;
}

export function ScheduleView({ workers, shifts, tags, store }: Props) {
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

  const days = weekDays(weekStart);

  // Derive eligible workers whenever the selected shift changes
  const eligible = form.shiftId ? store.eligibleWorkers(form.shiftId) : workers;
  const selectedShift = shifts.find(s => s.id === form.shiftId);
  const requiredTags = selectedShift
    ? tags.filter(t => selectedShift.requiredTagIds.includes(t.id))
    : [];

  function openAssign(date?: string, shiftId?: string) {
    const resolvedShiftId = shiftId ?? shifts[0]?.id ?? '';
    const eligibleForShift = store.eligibleWorkers(resolvedShiftId);
    setForm({
      date: date ?? toISODate(new Date()),
      shiftId: resolvedShiftId,
      workerId: eligibleForShift[0]?.id ?? '',
      notes: '',
    });
    setPrefill(date && shiftId ? { date, shiftId } : null);
    setModalOpen(true);
  }

  // When shift selection changes, reset worker to first eligible one
  function handleShiftChange(shiftId: string) {
    const eligibleForShift = store.eligibleWorkers(shiftId);
    setForm(f => ({
      ...f,
      shiftId,
      workerId: eligibleForShift[0]?.id ?? '',
    }));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form.date || !form.shiftId || !form.workerId) return;
    store.addAssignment(form);
    setModalOpen(false);
  }

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
        <button className="btn btn--primary" onClick={() => openAssign()}>+ Assign</button>
      </div>

      <div className="schedule-wrapper">
        <table className="schedule-table">
          <thead>
            <tr>
              <th className="schedule-table__corner">Shift</th>
              {days.map(d => (
                <th
                  key={d.toISOString()}
                  className={`schedule-table__day-head ${isToday(d) ? 'schedule-table__day-head--today' : ''}`}
                >
                  {formatDayHeader(d)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shifts.map(shift => {
              const shiftReqTags = tags.filter(t => shift.requiredTagIds.includes(t.id));
              return (
                <tr key={shift.id}>
                  <td className="schedule-table__shift-cell">
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
                    const cellAssignments = store.getAssignmentsFor(dateStr, shift.id);
                    const cellWorkers = cellAssignments
                      .map(a => ({ assignment: a, worker: workers.find(w => w.id === a.workerId) }))
                      .filter((x): x is { assignment: Assignment; worker: Worker } => x.worker !== undefined);

                    return (
                      <td
                        key={dateStr}
                        className={`schedule-table__cell ${isToday(day) ? 'schedule-table__cell--today' : ''}`}
                        onClick={() => openAssign(dateStr, shift.id)}
                      >
                        <div className="cell-content">
                          {cellWorkers.map(({ assignment, worker }) => (
                            <span key={assignment.id} onClick={e => e.stopPropagation()}>
                              <WorkerBadge
                                worker={worker}
                                onRemove={() => setDeleteTarget(assignment)}
                              />
                            </span>
                          ))}
                          <span className="cell-add-hint">+</span>
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
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
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
    </div>
  );
}
