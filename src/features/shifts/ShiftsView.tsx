import { useState } from 'react';
import type { Tag, ShiftType } from '../../types';
import type { Store } from '../../store/useStore';
import { Modal } from '../../components/Modal';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { TagBadge } from '../../components/TagBadge';
import { ColorPicker } from '../../components/ColorPicker';
import { TagToggleList } from '../../components/TagToggleList';
import { ViewModeToggle } from '../../components/ViewModeToggle';

interface ShiftFormData {
  name: string;
  start: string;
  end: string;
  color: string;
  requiredTagIds: string[];
  minWorkers: number;
}

const EMPTY_FORM: ShiftFormData = {
  name: '', start: '08:00', end: '16:00', color: '#34c98b', requiredTagIds: [], minWorkers: 1,
};

const PRESET_COLORS = [
  '#f9a825', '#7e57c2', '#1976d2', '#34c98b',
  '#e0544b', '#4f8ef7', '#00897b', '#ff7043',
];

interface Props {
  shifts: ShiftType[];
  tags: Tag[];
  store: Pick<Store, 'addShift' | 'updateShift' | 'deleteShift' | 'reorderShifts'>;
}

function formatTime(t: string) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

export function ShiftsView({ shifts, tags, store }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ShiftType | null>(null);
  const [form, setForm] = useState<ShiftFormData>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<ShiftType | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  function openAdd() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEdit(s: ShiftType) {
    setEditing(s);
    setForm({
      name: s.name, start: s.start, end: s.end,
      color: s.color, requiredTagIds: [...s.requiredTagIds],
      minWorkers: s.minWorkers,
    });
    setModalOpen(true);
  }

  function toggleTag(tagId: string) {
    setForm(f => ({
      ...f,
      requiredTagIds: f.requiredTagIds.includes(tagId)
        ? f.requiredTagIds.filter(id => id !== tagId)
        : [...f.requiredTagIds, tagId],
    }));
  }

  function handleDragStart(index: number) {
    setDragIndex(index);
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    setDropIndex(index);
  }

  function handleDrop(index: number) {
    if (dragIndex === null || dragIndex === index) {
      setDragIndex(null);
      setDropIndex(null);
      return;
    }
    const reordered = [...shifts];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(index, 0, moved);
    store.reorderShifts(reordered.map(s => s.id));
    setDragIndex(null);
    setDropIndex(null);
  }

  function handleDragEnd() {
    setDragIndex(null);
    setDropIndex(null);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (editing) {
      store.updateShift(editing.id, form);
    } else {
      store.addShift(form);
    }
    setModalOpen(false);
  }

  return (
    <div className="view-container">
      <div className="view-toolbar">
        <h2 className="view-title">Shift Types</h2>
        <div className="spacer" />
        <ViewModeToggle mode={viewMode} onChange={setViewMode} />
        <button className="btn btn--primary" onClick={openAdd}>+ Add Shift Type</button>
      </div>

      {shifts.length === 0 ? (
        <p className="empty-hint">No shift types yet. Add your first shift type above.</p>
      ) : viewMode === 'table' ? (
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Time</th>
              <th>Min Workers</th>
              <th>Required Tags</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shifts.map((s, i) => {
              const reqTags = tags.filter(t => s.requiredTagIds.includes(t.id));
              return (
                <tr
                  key={s.id}
                  className={dropIndex === i && dragIndex !== i ? 'schedule-row--drop-target' : undefined}
                  draggable
                  onDragStart={() => handleDragStart(i)}
                  onDragOver={e => handleDragOver(e, i)}
                  onDrop={() => handleDrop(i)}
                  onDragEnd={handleDragEnd}
                >
                  <td>
                    <span className="shift-name-cell">
                      <span className="shift-color-dot" style={{ backgroundColor: s.color }} />
                      {s.name}
                    </span>
                  </td>
                  <td>{formatTime(s.start)} – {formatTime(s.end)}</td>
                  <td>{s.minWorkers}</td>
                  <td>
                    {reqTags.length > 0
                      ? <span className="workday-chips">{reqTags.map(t => <TagBadge key={t.id} tag={t} size="sm" />)}</span>
                      : <span className="text-muted">—</span>}
                  </td>
                  <td className="action-cell">
                    <span className="shift-row-handle" title="Drag to reorder" style={{ cursor: 'grab', marginRight: 4 }}>⠿</span>
                    <button className="btn btn--ghost btn--sm" onClick={() => openEdit(s)}>Edit</button>
                    <button className="btn btn--ghost btn--sm btn--danger-text" onClick={() => setDeleteTarget(s)}>Delete</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <div className="card-grid">
          {shifts.map((s, i) => {
            const reqTags = tags.filter(t => s.requiredTagIds.includes(t.id));
            return (
              <div
                key={s.id}
                className={`card card--tall${dropIndex === i && dragIndex !== i ? ' card--drop-target' : ''}`}
                style={{ borderTopColor: s.color }}
                draggable
                onDragStart={() => handleDragStart(i)}
                onDragOver={e => handleDragOver(e, i)}
                onDrop={() => handleDrop(i)}
                onDragEnd={handleDragEnd}
              >
                <div className="card__drag-handle" title="Drag to reorder">⠿</div>
                <div className="card__avatar card__avatar--square" style={{ backgroundColor: s.color }}>
                  {s.name.charAt(0).toUpperCase()}
                </div>
                <div className="card__info">
                  <span className="card__name">{s.name}</span>
                  <span className="card__sub">
                    {formatTime(s.start)} – {formatTime(s.end)}
                    {' · '}{s.minWorkers} worker{s.minWorkers !== 1 ? 's' : ''} min
                  </span>
                  {reqTags.length > 0 && (
                    <div className="card__tags">
                      {reqTags.map(t => <TagBadge key={t.id} tag={t} size="sm" />)}
                    </div>
                  )}
                </div>
                <div className="card__actions">
                  <button className="btn btn--ghost btn--sm" onClick={() => openEdit(s)}>Edit</button>
                  <button
                    className="btn btn--ghost btn--sm btn--danger-text"
                    onClick={() => setDeleteTarget(s)}
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
        title={editing ? 'Edit Shift Type' : 'Add Shift Type'}
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
              placeholder="e.g. Morning, Evening"
              required
              autoFocus
            />
          </label>
          <div className="form__row">
            <label className="form__label">
              Start Time *
              <input
                className="form__input"
                type="time"
                value={form.start}
                onChange={e => setForm(f => ({ ...f, start: e.target.value }))}
                required
              />
            </label>
            <label className="form__label">
              End Time *
              <input
                className="form__input"
                type="time"
                value={form.end}
                onChange={e => setForm(f => ({ ...f, end: e.target.value }))}
                required
              />
            </label>
          </div>
          <label className="form__label">
            Min. Workers (autofill target)
            <input
              className="form__input"
              type="number"
              min={1}
              max={50}
              value={form.minWorkers}
              onChange={e => setForm(f => ({ ...f, minWorkers: Math.max(1, Number(e.target.value)) }))}
            />
          </label>
          <div className="form__label">
            Color
            <ColorPicker
              value={form.color}
              presets={PRESET_COLORS}
              onChange={(c) => setForm(f => ({ ...f, color: c }))}
            />
          </div>
          {tags.length > 0 && (
            <div className="form__label">
              Required Tags
              <p className="form__hint">Workers must hold all selected tags to be assignable to this shift.</p>
              <TagToggleList
                tags={tags}
                selectedIds={form.requiredTagIds}
                onToggle={toggleTag}
              />
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
        message={`Delete shift type "${deleteTarget?.name}"? All assignments for this shift will also be removed.`}
        onConfirm={() => deleteTarget && store.deleteShift(deleteTarget.id)}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
