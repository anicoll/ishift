import type { Tag } from '../types';

interface TagBadgeProps {
  tag: Tag;
  onRemove?: () => void;
  size?: 'sm' | 'md';
}

export function TagBadge({ tag, onRemove, size = 'md' }: TagBadgeProps) {
  return (
    <span
      className={`tag-badge ${size === 'sm' ? 'tag-badge--sm' : ''}`}
      style={{
        backgroundColor: tag.color + '22',
        borderColor: tag.color,
        color: tag.color,
      }}
    >
      {tag.name}
      {onRemove && (
        <button
          className="tag-badge__remove"
          onClick={onRemove}
          aria-label={`Remove tag ${tag.name}`}
        >
          ×
        </button>
      )}
    </span>
  );
}
