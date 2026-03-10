import { useState } from 'react';
import type { Tag, Worker, DayTimeRange, WorkerHoliday } from '../types';
import type { Store } from '../store/useStore';
import { Modal } from './Modal';
import { ConfirmDialog } from './ConfirmDialog';
import { TagBadge } from './TagBadge';

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function makeFullAvailability(): (DayTimeRange | null)[] {
  return Array.from({ length: 7 }, () => ({ start: '00:00', end: '23:59' }));
}

function isFullAvailability(availability: (DayTimeRange | null)[]): boolean {
  return availability.every(
    a => a !== null && a.start === '00:00' && a.end === '23:59',
  );
}

function availabilitySummary(availability: (DayTimeRange | null)[]): string {
  const available = DAY_NAMES.filter((_, i) => availability[i] !== null);
  if (available.length === 0) return 'Unavailable all week';
  if (available.length === 7) return 'All days';
  return available.join(', ');
}

interface WorkerFormData {
  name: string;
  role: string;
  color: string;
  tagIds: string[];
  maxShiftsPerWeek: number;
  availability: (DayTimeRange | null)[];
}

const EMPTY_FORM: WorkerFormData = {
  name: '',
  role: '',
  color: '#4f8ef7',
  tagIds: [],
  maxShiftsPerWeek: 5,
  availability: makeFullAvailability(),
};

const PRESET_COLORS = [
  '#4f8ef7', '#e0544b', '#34c98b', '#f9a825',
  '#7e57c2', '#00897b', '#e91e8c', '#ff7043',
];

interface Props {
  workers: Worker[];
  tags: Tag[];
  workerHolidays: WorkerHoliday[];
  store: Pick<Store, 'addWorker' | 'updateWorker' | 'deleteWorker' | 'addWorkerHoliday' | 'deleteWorkerHoliday'>;
}

export function WorkersView({ workers, tags, workerHolidays, store }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Worker | null>(null);
  const [form, setForm] = useState<WorkerFormData>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<Worker | null>(null);
  const [holidayWorkerId, setHolidayWorkerId] = useState<string | null>(null);
  const [newHolidayStart, setNewHolidayStart] = useState('');
  const [newHolidayEnd, setNewHolidayEnd] = useState('');
  const [newHolidayNote, setNewHolidayNote] = useState('');

  function openAdd() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEdit(w: Worker) {
    setEditing(w);
    setForm({
      name: w.name,
      role: w.role,
      color: w.color,
      tagIds: [...w.tagIds],
      maxShiftsPerWeek: w.maxShiftsPerWeek,
      availability: w.availability.map(a => (a ? { ...a } : null)),
    });
    setModalOpen(true);
  }

  function toggleTag(tagId: string) {
    setForm(f => ({
      ...f,
      tagIds: f.tagIds.includes(tagId)
        ? f.tagIds.filter(id => id !== tagId)
        : [...f.tagIds, tagId],
    }));
  }

  function toggleDay(dayIndex: number) {
    setForm(f => {
      const availability = f.availability.map(a => (a ? { ...a } : null)) as (DayTimeRange | null)[];
      availability[dayIndex] =
        availability[dayIndex] === null
          ? { start: '09:00', end: '17:00' }
          : null;
      return { ...f, availability };
    });
  }

  function updateDayHours(dayIndex: number, field: 'start' | 'end', value: string) {
    setForm(f => {
      const availability = f.availability.map(a => (a ? { ...a } : null)) as (DayTimeRange | null)[];
      const current = availability[dayIndex];
      if (current !== null) {
        availability[dayIndex] = { ...current, [field]: value };
      }
      return { ...f, availability };
    });
  }

  function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (editing) {
      store.updateWorker(editing.id, form);
    } else {
      store.addWorker(form);
    }
    setModalOpen(false);
  }

  return (
    <div className="view-container">
      <div className="view-toolbar">
        <h2 className="view-title">Workers</h2>
        <button className="btn btn--primary" onClick={openAdd}>+ Add Worker</button>
      </div>

      {workers.length === 0 ? (
        <p className="empty-hint">No workers yet. Add your first worker above.</p>
      ) : (
        <div className="card-grid">
          {workers.map(w => {
            const workerTags = tags.filter(t => w.tagIds.includes(t.id));
            const fullAvail = isFullAvailability(w.availability);
            const wHolidays = workerHolidays.filter(h => h.workerId === w.id)
              .sort((a, b) => a.startDate.localeCompare(b.startDate));
            const today = new Date().toISOString().slice(0, 10);
            const activeHoliday = wHolidays.find(h => h.startDate <= today && h.endDate >= today);
            const upcomingHolidays = wHolidays.filter(h => h.startDate > today);
            return (
              <div key={w.id} className="card card--tall" style={{ borderTopColor: w.color }}>
                <div className="card__avatar" style={{ backgroundColor: w.color }}>
                  {w.name.charAt(0).toUpperCase()}
                </div>
                <div className="card__info">
                  <span className="card__name">{w.name}</span>
                  <span className="card__sub">
                    {w.role || 'No role'}{' · '}max {w.maxShiftsPerWeek}/wk
                  </span>
                  {!fullAvail && (
                    <span className="card__sub card__sub--avail">
                      {availabilitySummary(w.availability)}
                    </span>
                  )}
                  {activeHoliday && (
                    <span className="card__sub card__sub--on-holiday">
                      On holiday until {formatDate(activeHoliday.endDate)}
                    </span>
                  )}
                  {!activeHoliday && upcomingHolidays.length > 0 && (
                    <span className="card__sub card__sub--avail">
                      {upcomingHolidays.length} upcoming holiday{upcomingHolidays.length > 1 ? 's' : ''}
                    </span>
                  )}
                  {workerTags.length > 0 && (
                    <div className="card__tags">
                      {workerTags.map(t => <TagBadge key={t.id} tag={t} size="sm" />)}
                    </div>
                  )}
                </div>
                <div className="card__actions">
                  <button className="btn btn--ghost btn--sm" onClick={() => setHolidayWorkerId(w.id)}>Holidays</button>
                  <button className="btn btn--ghost btn--sm" onClick={() => openEdit(w)}>Edit</button>
                  <button
                    className="btn btn--ghost btn--sm btn--danger-text"
                    onClick={() => setDeleteTarget(w)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        title={editing ? 'Edit Worker' : 'Add Worker'}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      >
        <form onSubmit={handleSubmit} className="form">
          <label className="form__label">
            Name *
            <input
              className="form__input"
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Jane Doe"
              required
              autoFocus
            />
          </label>
          <label className="form__label">
            Role / Position
            <input
              className="form__input"
              type="text"
              value={form.role}
              onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
              placeholder="e.g. Nurse, Cashier"
            />
          </label>
          <div className="form__label">
            Color
            <div className="color-picker">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  className={`color-swatch ${form.color === c ? 'color-swatch--active' : ''}`}
                  style={{ backgroundColor: c }}
                  onClick={() => setForm(f => ({ ...f, color: c }))}
                  aria-label={c}
                />
              ))}
              <input
                type="color"
                className="color-custom"
                value={form.color}
                onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                title="Custom color"
              />
            </div>
          </div>
          <label className="form__label">
            Max Shifts / Week (autofill limit)
            <input
              className="form__input"
              type="number"
              min={1}
              max={7}
              value={form.maxShiftsPerWeek}
              onChange={e => setForm(f => ({ ...f, maxShiftsPerWeek: Math.max(1, Number(e.target.value)) }))}
            />
          </label>

          {/* ── Availability ─────────────────────────────────── */}
          <div className="form__label">
            Availability
            <div className="availability-grid">
              {DAY_NAMES.map((day, i) => {
                const avail = form.availability[i];
                const available = avail !== null;
                return (
                  <div key={day} className={`availability-row ${available ? '' : 'availability-row--off'}`}>
                    <label className="availability-day-toggle">
                      <input
                        type="checkbox"
                        checked={available}
                        onChange={() => toggleDay(i)}
                      />
                      <span className="availability-day-name">{day}</span>
                    </label>
                    {available && avail && (
                      <div className="availability-times">
                        <input
                          type="time"
                          className="form__input form__input--time"
                          value={avail.start}
                          onChange={e => updateDayHours(i, 'start', e.target.value)}
                        />
                        <span className="availability-sep">–</span>
                        <input
                          type="time"
                          className="form__input form__input--time"
                          value={avail.end}
                          onChange={e => updateDayHours(i, 'end', e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {tags.length > 0 && (
            <div className="form__label">
              Tags / Qualifications
              <div className="tag-toggle-list">
                {tags.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    className={`tag-toggle ${form.tagIds.includes(t.id) ? 'tag-toggle--active' : ''}`}
                    style={
                      form.tagIds.includes(t.id)
                        ? { backgroundColor: t.color + '22', borderColor: t.color, color: t.color }
                        : {}
                    }
                    onClick={() => toggleTag(t.id)}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="form__footer">
            <button type="button" className="btn btn--ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary">Save</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        message={`Delete worker "${deleteTarget?.name}"? All their assignments will also be removed.`}
        onConfirm={() => deleteTarget && store.deleteWorker(deleteTarget.id)}
        onClose={() => setDeleteTarget(null)}
      />

      {/* ── Worker Holiday Modal ── */}
      {(() => {
        const hw = workers.find(w => w.id === holidayWorkerId);
        if (!hw) return null;
        const hwHolidays = workerHolidays
          .filter(h => h.workerId === hw.id)
          .sort((a, b) => a.startDate.localeCompare(b.startDate));

        function handleAddHoliday(e: { preventDefault(): void }) {
          e.preventDefault();
          if (!newHolidayStart || !newHolidayEnd || newHolidayEnd < newHolidayStart) return;
          store.addWorkerHoliday({
            workerId: hw!.id,
            startDate: newHolidayStart,
            endDate: newHolidayEnd,
            note: newHolidayNote.trim(),
          });
          setNewHolidayStart('');
          setNewHolidayEnd('');
          setNewHolidayNote('');
        }

        return (
          <Modal
            title={`Holidays — ${hw.name}`}
            open={holidayWorkerId !== null}
            onClose={() => setHolidayWorkerId(null)}
          >
            <div className="form">
              <form onSubmit={handleAddHoliday} className="worker-holiday-add-form">
                <div className="worker-holiday-date-row">
                  <label className="form__label" style={{ flex: 1 }}>
                    From
                    <input
                      className="form__input"
                      type="date"
                      value={newHolidayStart}
                      onChange={e => setNewHolidayStart(e.target.value)}
                      required
                    />
                  </label>
                  <label className="form__label" style={{ flex: 1 }}>
                    To
                    <input
                      className="form__input"
                      type="date"
                      value={newHolidayEnd}
                      min={newHolidayStart}
                      onChange={e => setNewHolidayEnd(e.target.value)}
                      required
                    />
                  </label>
                </div>
                <label className="form__label">
                  Note (optional)
                  <input
                    className="form__input"
                    type="text"
                    value={newHolidayNote}
                    onChange={e => setNewHolidayNote(e.target.value)}
                    placeholder="e.g. Annual leave"
                  />
                </label>
                <button type="submit" className="btn btn--primary btn--sm">Add Holiday</button>
              </form>

              {hwHolidays.length === 0 ? (
                <p className="bank-holiday-empty">No holidays assigned yet.</p>
              ) : (
                <ul className="bank-holiday-list">
                  {hwHolidays.map(h => (
                    <li key={h.id} className="bank-holiday-item">
                      <span className="bank-holiday-item__date">
                        {formatDate(h.startDate)} – {formatDate(h.endDate)}
                      </span>
                      {h.note && <span className="bank-holiday-item__name">{h.note}</span>}
                      <button
                        className="btn btn--ghost btn--sm btn--danger-text"
                        onClick={() => store.deleteWorkerHoliday(h.id)}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="form__footer">
                <button className="btn btn--ghost" onClick={() => setHolidayWorkerId(null)}>Close</button>
              </div>
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}
