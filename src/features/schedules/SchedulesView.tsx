import { useState } from 'react'
import type { ScheduleDefinition } from '../../types'
import type { Store } from '../../store/useStore'
import { Modal } from '../../components/Modal'
import { ConfirmDialog } from '../../components/ConfirmDialog'

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const LENGTH_PRESETS = [
  { label: 'Week (7 days)', value: 7 },
  { label: 'Fortnight (14 days)', value: 14 },
]

interface FormData {
  name: string
  lengthDays: number
  workDays: boolean[]
}

const DEFAULT_FORM: FormData = {
  name: '',
  lengthDays: 7,
  workDays: [true, true, true, true, true, false, false],
}

interface Props {
  scheduleDefinitions: ScheduleDefinition[]
  activeScheduleId: string
  store: Pick<
    Store,
    | 'addScheduleDefinition'
    | 'updateScheduleDefinition'
    | 'deleteScheduleDefinition'
    | 'setActiveScheduleId'
  >
}

export function SchedulesView({ scheduleDefinitions, activeScheduleId, store }: Props) {
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<ScheduleDefinition | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ScheduleDefinition | null>(null)
  const [form, setForm] = useState<FormData>(DEFAULT_FORM)
  const [customLength, setCustomLength] = useState(false)

  function openAdd() {
    setEditTarget(null)
    setForm(DEFAULT_FORM)
    setCustomLength(false)
    setModalOpen(true)
  }

  function openEdit(def: ScheduleDefinition) {
    setEditTarget(def)
    setForm({ name: def.name, lengthDays: def.lengthDays, workDays: [...def.workDays] })
    setCustomLength(!LENGTH_PRESETS.some((p) => p.value === def.lengthDays))
    setModalOpen(true)
  }

  function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault()
    if (!form.name.trim()) return
    if (editTarget) {
      store.updateScheduleDefinition(editTarget.id, form)
    } else {
      store.addScheduleDefinition(form)
    }
    setModalOpen(false)
  }

  function toggleWorkDay(idx: number) {
    setForm((f) => {
      const next = [...f.workDays]
      next[idx] = !next[idx]
      return { ...f, workDays: next }
    })
  }

  const workDayCount = form.workDays.filter(Boolean).length

  return (
    <div className="view-container">
      <div className="view-toolbar">
        <h2>Schedule Definitions</h2>
        <div className="spacer" />
        <button className="btn btn--primary" onClick={openAdd}>
          + New Schedule
        </button>
      </div>

      {scheduleDefinitions.length === 0 ? (
        <p className="empty-hint">No schedules defined. Add one to get started.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Length</th>
              <th>Working Days</th>
              <th>Active</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {scheduleDefinitions.map((def) => (
              <tr key={def.id} className={def.id === activeScheduleId ? 'row--active' : undefined}>
                <td>{def.name}</td>
                <td>{def.lengthDays} days</td>
                <td>
                  <span className="workday-chips">
                    {DAY_LABELS.map((label, i) => (
                      <span
                        key={label}
                        className={`workday-chip${def.workDays[i] ? ' workday-chip--on' : ''}`}
                      >
                        {label}
                      </span>
                    ))}
                  </span>
                </td>
                <td>
                  {def.id === activeScheduleId ? (
                    <span className="badge badge--active">Active</span>
                  ) : (
                    <button
                      className="btn btn--ghost btn--sm"
                      onClick={() => store.setActiveScheduleId(def.id)}
                    >
                      Set active
                    </button>
                  )}
                </td>
                <td className="action-cell">
                  <button className="btn btn--ghost btn--sm" onClick={() => openEdit(def)}>
                    Edit
                  </button>
                  <button
                    className="btn btn--ghost btn--sm btn--danger-text"
                    disabled={scheduleDefinitions.length === 1}
                    title={
                      scheduleDefinitions.length === 1
                        ? 'Cannot delete the only schedule'
                        : undefined
                    }
                    onClick={() => setDeleteTarget(def)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ── Add / Edit modal ── */}
      <Modal
        open={modalOpen}
        title={editTarget ? 'Edit Schedule' : 'New Schedule'}
        onClose={() => setModalOpen(false)}
      >
        <form className="form" onSubmit={handleSubmit}>
          <label className="form__label">
            Name
            <input
              className="form__input"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Work Week"
              required
              autoFocus
            />
          </label>

          <label className="form__label">
            Period length
            <select
              className="form__input"
              value={customLength ? 'custom' : String(form.lengthDays)}
              onChange={(e) => {
                if (e.target.value === 'custom') {
                  setCustomLength(true)
                } else {
                  setCustomLength(false)
                  setForm((f) => ({ ...f, lengthDays: Number(e.target.value) }))
                }
              }}
            >
              {LENGTH_PRESETS.map((p) => (
                <option key={p.value} value={String(p.value)}>
                  {p.label}
                </option>
              ))}
              <option value="custom">Custom…</option>
            </select>
          </label>

          {customLength && (
            <label className="form__label">
              Number of days
              <input
                className="form__input"
                type="number"
                min={1}
                max={365}
                value={form.lengthDays}
                onChange={(e) => setForm((f) => ({ ...f, lengthDays: Number(e.target.value) }))}
                required
              />
            </label>
          )}

          <fieldset className="form__fieldset">
            <legend className="form__legend">Working days</legend>
            <div className="workday-toggle-row">
              {DAY_LABELS.map((label, i) => (
                <label key={label} className="workday-toggle">
                  <input
                    type="checkbox"
                    checked={form.workDays[i] ?? false}
                    onChange={() => toggleWorkDay(i)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            {workDayCount === 0 && (
              <p className="form__hint form__hint--warn">Select at least one working day.</p>
            )}
          </fieldset>

          <div className="form__actions">
            <button type="button" className="btn btn--ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary" disabled={workDayCount === 0}>
              {editTarget ? 'Save' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Delete confirmation ── */}
      <ConfirmDialog
        open={!!deleteTarget}
        message={`Delete "${deleteTarget?.name}"? This cannot be undone.`}
        onConfirm={() => {
          if (deleteTarget) store.deleteScheduleDefinition(deleteTarget.id)
          setDeleteTarget(null)
        }}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  )
}
