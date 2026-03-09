import { useState } from 'react';
import type { Tag, ShiftType } from '../types';
import type { Store } from '../store/useStore';
import { Modal } from './Modal';
import { ConfirmDialog } from './ConfirmDialog';
import { TagBadge } from './TagBadge';

interface ShiftFormData {
  name: string;
  start: string;
  end: string;
  color: string;
  requiredTagIds: string[];
}

const EMPTY_FORM: ShiftFormData = {
  name: '', start: '08:00', end: '16:00', color: '#34c98b', requiredTagIds: [],
};

const PRESET_COLORS = [
  '#f9a825', '#7e57c2', '#1976d2', '#34c98b',
  '#e0544b', '#4f8ef7', '#00897b', '#ff7043',
];

interface Props {
  shifts: ShiftType[];
  tags: Tag[];
  store: Pick<Store, 'addShift' | 'updateShift' | 'deleteShift'>;
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
        <button className="btn btn--primary" onClick={openAdd}>+ Add Shift Type</button>
      </div>

      {shifts.length === 0 ? (
        <p className="empty-hint">No shift types yet. Add your first shift type above.</p>
      ) : (
        <div className="card-grid">
          {shifts.map(s => {
            const reqTags = tags.filter(t => s.requiredTagIds.includes(t.id));
            return (
              <div key={s.id} className="card card--tall" style={{ borderTopColor: s.color }}>
                <div className="card__avatar card__avatar--square" style={{ backgroundColor: s.color }}>
                  {s.name.charAt(0).toUpperCase()}
                </div>
                <div className="card__info">
                  <span className="card__name">{s.name}</span>
                  <span className="card__sub">
                    {formatTime(s.start)} – {formatTime(s.end)}
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
          {tags.length > 0 && (
            <div className="form__label">
              Required Tags
              <p className="form__hint">Workers must hold all selected tags to be assignable to this shift.</p>
              <div className="tag-toggle-list">
                {tags.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    className={`tag-toggle ${form.requiredTagIds.includes(t.id) ? 'tag-toggle--active' : ''}`}
                    style={
                      form.requiredTagIds.includes(t.id)
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
        message={`Delete shift type "${deleteTarget?.name}"? All assignments for this shift will also be removed.`}
        onConfirm={() => deleteTarget && store.deleteShift(deleteTarget.id)}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
