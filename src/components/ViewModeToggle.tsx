interface Props {
  mode: 'cards' | 'table'
  onChange: (mode: 'cards' | 'table') => void
}

export function ViewModeToggle({ mode, onChange }: Props) {
  return (
    <div className="view-mode-toggle">
      <button
        className={`btn btn--ghost btn--sm${mode === 'cards' ? ' btn--active' : ''}`}
        onClick={() => onChange('cards')}
        title="Card view"
      >
        ⊞
      </button>
      <button
        className={`btn btn--ghost btn--sm${mode === 'table' ? ' btn--active' : ''}`}
        onClick={() => onChange('table')}
        title="Table view"
      >
        ☰
      </button>
    </div>
  )
}
