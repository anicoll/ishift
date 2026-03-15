import { useState } from 'react';
import type { Tag } from '../../types';
import type { Store } from '../../store/useStore';
import { Modal } from '../../components/Modal';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { TagBadge } from '../../components/TagBadge';
import { ColorPicker } from '../../components/ColorPicker';
import { ViewModeToggle } from '../../components/ViewModeToggle';

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
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

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
        <div className="spacer" />
        <ViewModeToggle mode={viewMode} onChange={setViewMode} />
        <button className="btn btn--primary" onClick={openAdd}>+ Add Tag</button>
      </div>

      <p className="tags-hint">
        Tags are qualifications or attributes workers can hold. Shift types can require specific tags — only eligible workers will appear when assigning.
      </p>

      {tags.length === 0 ? (
        <p className="empty-hint">No tags yet. Add your first tag above.</p>
      ) : viewMode === 'table' ? (
        <table className="data-table">
          <thead>
            <tr>
              <th>Tag</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {tags.map(t => (
              <tr key={t.id}>
                <td><TagBadge tag={t} /></td>
                <td className="action-cell">
                  <button className="btn btn--ghost btn--sm" onClick={() => openEdit(t)}>Edit</button>
                  <button
                    className="btn btn--ghost btn--sm btn--danger-text"
                    onClick={() => setDeleteTarget(t)}
                  >Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
            <ColorPicker
              value={form.color}
              presets={PRESET_COLORS}
              onChange={(c) => setForm(f => ({ ...f, color: c }))}
            />
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
