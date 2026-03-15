import type { Tag } from '../types'

interface Props {
  tags: Tag[]
  selectedIds: string[]
  onToggle: (tagId: string) => void
}

export function TagToggleList({ tags, selectedIds, onToggle }: Props) {
  return (
    <div className="tag-toggle-list">
      {tags.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`tag-toggle${selectedIds.includes(t.id) ? ' tag-toggle--active' : ''}`}
          style={
            selectedIds.includes(t.id)
              ? { backgroundColor: t.color + '22', borderColor: t.color, color: t.color }
              : {}
          }
          onClick={() => onToggle(t.id)}
        >
          {t.name}
        </button>
      ))}
    </div>
  )
}
