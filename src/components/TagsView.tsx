import { useState } from 'react';
import type { Tag } from '../types';
import type { Store } from '../store/useStore';
import { Modal } from './Modal';
import { ConfirmDialog } from './ConfirmDialog';
import { TagBadge } from './TagBadge';

interface TagFormData {
  name: string;
  color: string;
}

const EMPTY_FORM: TagFormData = { name: '', color: '#4f8ef7' };

const PRESET_COLORS = [
  '#4f8ef7', '#e0544b', '#34c98b', '#f9a825',
  '#7e57c2', '#00897b', '#e91e8c', '#ff7043',
];

interface Props {
  tags: Tag[];
  store: Pick<Store, 'addTag' | 'updateTag' | 'deleteTag'>;
}

export function TagsView({ tags, store }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Tag | null>(null);
  const [form, setForm] = useState<TagFormData>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<Tag | null>(null);

  function openAdd() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEdit(t: Tag) {
    setEditing(t);
    setForm({ name: t.name, color: t.color });
    setModalOpen(true);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (editing) {
      store.updateTag(editing.id, form);
    } else {
      store.addTag(form);
    }
    setModalOpen(false);
  }

  return (
    <div className="view-container">
      <div className="view-toolbar">
        <h2 className="view-title">Tags</h2>
        <button className="btn btn--primary" onClick={openAdd}>+ Add Tag</button>
      </div>

      <p className="tags-hint">
        Tags are qualifications or attributes workers can hold. Shift types can require specific tags — only eligible workers will appear when assigning.
      </p>

      {tags.length === 0 ? (
        <p className="empty-hint">No tags yet. Add your first tag above.</p>
      ) : (
        <div className="card-grid">
          {tags.map(t => (
            <div key={t.id} className="card" style={{ borderTopColor: t.color }}>
              <div className="card__tag-preview">
                <TagBadge tag={t} />
              </div>
              <div className="card__actions">
                <button className="btn btn--ghost btn--sm" onClick={() => openEdit(t)}>Edit</button>
                <button
                  className="btn btn--ghost btn--sm btn--danger-text"
                  onClick={() => setDeleteTarget(t)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        title={editing ? 'Edit Tag' : 'Add Tag'}
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
              placeholder="e.g. Certified Nurse, Forklift Licensed"
              required
              autoFocus
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
          {form.name && (
            <div className="form__label">
              Preview
              <div style={{ marginTop: 4 }}>
                <TagBadge tag={{ id: '', name: form.name, color: form.color }} />
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
        message={`Delete tag "${deleteTarget?.name}"? It will be removed from all workers and shift types.`}
        onConfirm={() => deleteTarget && store.deleteTag(deleteTarget.id)}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
