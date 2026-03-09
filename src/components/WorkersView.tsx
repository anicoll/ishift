import { useState } from 'react';
import type { Tag, Worker } from '../types';
import type { Store } from '../store/useStore';
import { Modal } from './Modal';
import { ConfirmDialog } from './ConfirmDialog';
import { TagBadge } from './TagBadge';

interface WorkerFormData {
  name: string;
  role: string;
  color: string;
  tagIds: string[];
}

const EMPTY_FORM: WorkerFormData = { name: '', role: '', color: '#4f8ef7', tagIds: [] };

const PRESET_COLORS = [
  '#4f8ef7', '#e0544b', '#34c98b', '#f9a825',
  '#7e57c2', '#00897b', '#e91e8c', '#ff7043',
];

interface Props {
  workers: Worker[];
  tags: Tag[];
  store: Pick<Store, 'addWorker' | 'updateWorker' | 'deleteWorker'>;
}

export function WorkersView({ workers, tags, store }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Worker | null>(null);
  const [form, setForm] = useState<WorkerFormData>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<Worker | null>(null);

  function openAdd() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEdit(w: Worker) {
    setEditing(w);
    setForm({ name: w.name, role: w.role, color: w.color, tagIds: [...w.tagIds] });
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

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
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
            return (
              <div key={w.id} className="card card--tall" style={{ borderTopColor: w.color }}>
                <div className="card__avatar" style={{ backgroundColor: w.color }}>
                  {w.name.charAt(0).toUpperCase()}
                </div>
                <div className="card__info">
                  <span className="card__name">{w.name}</span>
                  <span className="card__sub">{w.role || 'No role'}</span>
                  {workerTags.length > 0 && (
                    <div className="card__tags">
                      {workerTags.map(t => <TagBadge key={t.id} tag={t} size="sm" />)}
                    </div>
                  )}
                </div>
                <div className="card__actions">
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
    </div>
  );
}
