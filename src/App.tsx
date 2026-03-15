import { useState } from 'react'
import type { View } from './types'
import { useStore } from './store/useStore'
import { WorkersView } from './features/workers/WorkersView'
import { ShiftsView } from './features/shifts/ShiftsView'
import { ScheduleView } from './features/schedule/ScheduleView'
import { TagsView } from './features/tags/TagsView'

const NAV_LABELS: Record<View, string> = {
  schedule: 'Schedule',
  workers: 'Workers',
  shifts: 'Shift Types',
  tags: 'Tags',
}

export default function App() {
  const [view, setView] = useState<View>('schedule')
  const store = useStore()

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-logo">
          <span className="app-logo__icon">⇌</span>
          <span className="app-logo__text">iShift</span>
        </div>
        <nav className="app-nav">
          {(Object.keys(NAV_LABELS) as View[]).map((v) => (
            <button
              key={v}
              className={`nav-btn ${view === v ? 'nav-btn--active' : ''}`}
              onClick={() => setView(v)}
            >
              {NAV_LABELS[v]}
            </button>
          ))}
        </nav>
      </header>

      <main className="app-main">
        {view === 'schedule' && (
          <ScheduleView
            workers={store.workers}
            shifts={store.shifts}
            tags={store.tags}
            bankHolidays={store.bankHolidays}
            workerHolidays={store.workerHolidays}
            store={store}
          />
        )}
        {view === 'workers' && (
          <WorkersView
            workers={store.workers}
            tags={store.tags}
            workerHolidays={store.workerHolidays}
            store={store}
          />
        )}
        {view === 'shifts' && <ShiftsView shifts={store.shifts} tags={store.tags} store={store} />}
        {view === 'tags' && <TagsView tags={store.tags} store={store} />}
      </main>

      <footer className="app-footer">
        <span>Built with ❤️ & Claude by github.com/anicoll/ishift</span>
      </footer>
    </div>
  )
}
