import type { Worker } from '../types'

interface WorkerBadgeProps {
  worker: Worker
  onRemove?: () => void
}

export function WorkerBadge({ worker, onRemove }: WorkerBadgeProps) {
  return (
    <span
      className="worker-badge"
      style={{
        backgroundColor: worker.color + '22',
        borderColor: worker.color,
        color: worker.color,
      }}
    >
      <span className="worker-badge__dot" style={{ backgroundColor: worker.color }} />
      {worker.name}
      {onRemove && (
        <button
          className="worker-badge__remove"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          aria-label={`Remove ${worker.name}`}
        >
          ×
        </button>
      )}
    </span>
  )
}
