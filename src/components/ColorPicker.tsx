const DEFAULT_PRESETS = [
  '#4f8ef7', '#e0544b', '#34c98b', '#f9a825',
  '#7e57c2', '#00897b', '#e91e8c', '#ff7043',
]

interface Props {
  value: string
  onChange: (color: string) => void
  presets?: string[]
}

export function ColorPicker({ value, onChange, presets = DEFAULT_PRESETS }: Props) {
  return (
    <div className="color-picker">
      {presets.map((c) => (
        <button
          key={c}
          type="button"
          className={`color-swatch${value === c ? ' color-swatch--active' : ''}`}
          style={{ backgroundColor: c }}
          onClick={() => onChange(c)}
          aria-label={c}
        />
      ))}
      <input
        type="color"
        className="color-custom"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        title="Custom color"
      />
    </div>
  )
}
