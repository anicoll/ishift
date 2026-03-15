import type { Assignment, Worker, ShiftType, Tag } from '../types'

interface GoRuntime {
  new (): { importObject: WebAssembly.Imports; run(instance: WebAssembly.Instance): void }
}

declare global {
  interface Window {
    Go: GoRuntime
    generateSchedulePDF: (json: string) => { data?: string; error?: string }
  }
}

interface PDFResult {
  data?: string
  error?: string
}

let wasmReady: Promise<void> | null = null

function initWasm(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window.Go === 'undefined') {
      reject(new Error('Go WASM runtime not loaded. Ensure wasm_exec.js is included.'))
      return
    }
    const go = new window.Go()
    // import.meta.env.BASE_URL is set by Vite to the configured base path,
    // e.g. '/ishift/' on GitHub Pages or '/' in dev — so the fetch is always correct.
    WebAssembly.instantiateStreaming(fetch(`${import.meta.env.BASE_URL}pdf.wasm`), go.importObject)
      .then((result) => {
        go.run(result.instance)
        resolve()
      })
      .catch(reject)
  })
}

export async function downloadSchedulePDF(
  assignments: Assignment[],
  workers: Worker[],
  shifts: ShiftType[],
  tags: Tag[],
  startDate: string,
  endDate: string,
): Promise<void> {
  if (!wasmReady) {
    wasmReady = initWasm()
  }
  await wasmReady

  const payload = {
    startDate,
    endDate,
    assignments: assignments.map((a) => ({
      id: a.id,
      date: a.date,
      shiftId: a.shiftId,
      workerId: a.workerId,
      notes: a.notes ?? '',
    })),
    workers: workers.map((w) => ({ id: w.id, name: w.name, role: w.role ?? '' })),
    shifts: shifts.map((s) => ({
      id: s.id,
      name: s.name,
      start: s.start,
      end: s.end,
      color: s.color ?? '',
      requiredTagIds: s.requiredTagIds ?? [],
    })),
    tags: tags.map((t) => ({ id: t.id, name: t.name, color: t.color ?? '' })),
  }

  const result: PDFResult = window.generateSchedulePDF(JSON.stringify(payload))

  if (result.error) {
    throw new Error(result.error)
  }
  if (!result.data) {
    throw new Error('No PDF data returned')
  }

  const binary = atob(result.data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }

  const blob = new Blob([bytes], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `schedule_${startDate}_to_${endDate}.pdf`
  anchor.click()
  URL.revokeObjectURL(url)
}
