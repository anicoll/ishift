import { useState } from 'react'
import type { BankHoliday } from '../../types'
import type { Store } from '../../store/useStore'
import { Modal } from '../../components/Modal'

interface Props {
  open: boolean
  bankHolidays: BankHoliday[]
  store: Pick<Store, 'addBankHoliday' | 'deleteBankHoliday'>
  onClose: () => void
}

// ── Region data ───────────────────────────────────────────────────────────────

interface Subdivision {
  code: string
  name: string
}

interface Region {
  country: string
  countryName: string
  subdivisions: Subdivision[]
}

const REGIONS: Region[] = [
  {
    country: 'AU',
    countryName: 'Australia',
    subdivisions: [
      { code: 'AU-ACT', name: 'Australian Capital Territory' },
      { code: 'AU-NSW', name: 'New South Wales' },
      { code: 'AU-NT', name: 'Northern Territory' },
      { code: 'AU-QLD', name: 'Queensland' },
      { code: 'AU-SA', name: 'South Australia' },
      { code: 'AU-TAS', name: 'Tasmania' },
      { code: 'AU-VIC', name: 'Victoria' },
      { code: 'AU-WA', name: 'Western Australia' },
    ],
  },
  {
    country: 'NZ',
    countryName: 'New Zealand',
    subdivisions: [],
  },
  {
    country: 'GB',
    countryName: 'United Kingdom',
    subdivisions: [
      { code: 'GB-ENG', name: 'England' },
      { code: 'GB-NIR', name: 'Northern Ireland' },
      { code: 'GB-SCT', name: 'Scotland' },
      { code: 'GB-WLS', name: 'Wales' },
    ],
  },
  {
    country: 'US',
    countryName: 'United States',
    subdivisions: [],
  },
  {
    country: 'CA',
    countryName: 'Canada',
    subdivisions: [],
  },
]

// ── Nager.Date API types ──────────────────────────────────────────────────────

interface NagerHoliday {
  date: string
  localName: string
  name: string
  countryCode: string
  global: boolean
  counties: string[] | null
  types: string[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('en-AU', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

const currentYear = new Date().getFullYear()
const YEAR_OPTIONS = [currentYear - 1, currentYear, currentYear + 1, currentYear + 2]

// ── Component ─────────────────────────────────────────────────────────────────

export function BankHolidayModal({ open, bankHolidays, store, onClose }: Props) {
  // Manual add form
  const [newDate, setNewDate] = useState('')
  const [newName, setNewName] = useState('')

  // Import section
  const [importCountry, setImportCountry] = useState('AU')
  const [importSubdivision, setImportSubdivision] = useState('AU-NSW')
  const [importYear, setImportYear] = useState(currentYear)
  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [fetched, setFetched] = useState<NagerHoliday[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const region = REGIONS.find((r) => r.country === importCountry) ?? REGIONS[0]
  const existingDates = new Set(bankHolidays.map((h) => h.date))

  function handleCountryChange(country: string) {
    setImportCountry(country)
    const reg = REGIONS.find((r) => r.country === country)
    setImportSubdivision(reg?.subdivisions[0]?.code ?? '')
    setFetched([])
    setSelected(new Set())
    setFetchError(null)
  }

  async function handleFetch() {
    setFetching(true)
    setFetchError(null)
    setFetched([])
    setSelected(new Set())
    try {
      const res = await fetch(
        `https://date.nager.at/api/v3/PublicHolidays/${importYear}/${importCountry}`,
      )
      if (!res.ok) throw new Error(`Request failed (${res.status})`)
      const data: NagerHoliday[] = await res.json()

      // Filter to national + chosen subdivision
      const filtered = data.filter((h) => {
        if (!h.counties || h.counties.length === 0) return true // national/global
        if (importSubdivision) return h.counties.includes(importSubdivision)
        return true
      })

      setFetched(filtered)
      // Pre-select holidays not already added
      setSelected(new Set(filtered.filter((h) => !existingDates.has(h.date)).map((h) => h.date)))
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to fetch holidays')
    } finally {
      setFetching(false)
    }
  }

  function toggleSelect(date: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(date)) next.delete(date)
      else next.add(date)
      return next
    })
  }

  function handleImport() {
    for (const h of fetched) {
      if (selected.has(h.date) && !existingDates.has(h.date)) {
        store.addBankHoliday({ date: h.date, name: h.localName || h.name })
      }
    }
    setFetched([])
    setSelected(new Set())
  }

  function handleManualAdd(e: { preventDefault(): void }) {
    e.preventDefault()
    if (!newDate || !newName.trim()) return
    store.addBankHoliday({ date: newDate, name: newName.trim() })
    setNewDate('')
    setNewName('')
  }

  const sorted = [...bankHolidays].sort((a, b) => a.date.localeCompare(b.date))
  const importableCount = fetched.filter(
    (h) => selected.has(h.date) && !existingDates.has(h.date),
  ).length

  return (
    <Modal title="Bank Holidays" open={open} onClose={onClose} size="lg">
      <div className="form">
        {/* ── Import from region ── */}
        <div className="bh-section">
          <div className="bh-section__title">Import from region</div>
          <div className="bh-import-controls">
            <select
              className="form__input"
              value={importCountry}
              onChange={(e) => handleCountryChange(e.target.value)}
            >
              {REGIONS.map((r) => (
                <option key={r.country} value={r.country}>
                  {r.countryName}
                </option>
              ))}
            </select>

            {region.subdivisions.length > 0 && (
              <select
                className="form__input"
                value={importSubdivision}
                onChange={(e) => setImportSubdivision(e.target.value)}
              >
                {region.subdivisions.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}

            <select
              className="form__input bh-year-select"
              value={importYear}
              onChange={(e) => setImportYear(Number(e.target.value))}
            >
              {YEAR_OPTIONS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>

            <button className="btn btn--ghost btn--sm" onClick={handleFetch} disabled={fetching}>
              {fetching ? 'Loading…' : 'Load'}
            </button>
          </div>

          {fetchError && <p className="bh-fetch-error">{fetchError}</p>}

          {fetched.length > 0 && (
            <>
              <div className="bh-preview-header">
                <span className="bh-preview-count">
                  {fetched.length} holiday{fetched.length !== 1 ? 's' : ''} found
                </span>
                <div className="bh-preview-actions">
                  <button
                    className="btn btn--ghost btn--sm"
                    onClick={() =>
                      setSelected(
                        new Set(
                          fetched.filter((h) => !existingDates.has(h.date)).map((h) => h.date),
                        ),
                      )
                    }
                  >
                    Select all new
                  </button>
                  <button className="btn btn--ghost btn--sm" onClick={() => setSelected(new Set())}>
                    Deselect all
                  </button>
                </div>
              </div>
              <ul className="bh-preview-list">
                {fetched.map((h) => {
                  const alreadyAdded = existingDates.has(h.date)
                  const isSelected = selected.has(h.date)
                  return (
                    <li
                      key={h.date}
                      className={`bh-preview-item ${alreadyAdded ? 'bh-preview-item--added' : ''}`}
                      onClick={() => !alreadyAdded && toggleSelect(h.date)}
                    >
                      <input
                        type="checkbox"
                        checked={alreadyAdded || isSelected}
                        disabled={alreadyAdded}
                        onChange={() => toggleSelect(h.date)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <span className="bh-preview-item__date">{formatDate(h.date)}</span>
                      <span className="bh-preview-item__name">{h.localName || h.name}</span>
                      {alreadyAdded && <span className="bh-preview-item__badge">Added</span>}
                    </li>
                  )
                })}
              </ul>
              <div className="bh-import-footer">
                <button
                  className="btn btn--primary btn--sm"
                  onClick={handleImport}
                  disabled={importableCount === 0}
                >
                  Import {importableCount > 0 ? `${importableCount} selected` : ''}
                </button>
              </div>
            </>
          )}
        </div>

        {/* ── Manual add ── */}
        <div className="bh-section">
          <div className="bh-section__title">Add manually</div>
          <form onSubmit={handleManualAdd} className="bank-holiday-add-form">
            <input
              className="form__input"
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              required
            />
            <input
              className="form__input"
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Holiday name"
              required
            />
            <button type="submit" className="btn btn--primary btn--sm">
              Add
            </button>
          </form>
        </div>

        {/* ── Current holidays list ── */}
        {sorted.length === 0 ? (
          <p className="bank-holiday-empty">No bank holidays defined yet.</p>
        ) : (
          <div className="bh-section">
            <div className="bh-section__title">Saved holidays ({sorted.length})</div>
            <ul className="bank-holiday-list">
              {sorted.map((h) => (
                <li key={h.id} className="bank-holiday-item">
                  <span className="bank-holiday-item__date">{formatDate(h.date)}</span>
                  <span className="bank-holiday-item__name">{h.name}</span>
                  <button
                    className="btn btn--ghost btn--sm btn--danger-text"
                    onClick={() => store.deleteBankHoliday(h.id)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="form__footer">
          <button className="btn btn--ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  )
}
