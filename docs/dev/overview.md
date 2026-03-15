# iShift — Developer Overview

## What it is

iShift is a browser-based shift scheduling tool for small teams. It runs entirely in the browser with no backend — all state is persisted to `localStorage`.

## Tech stack

- **React 19 + TypeScript** via Vite
- **Vitest** for unit tests
- **No UI library** — custom CSS in `src/index.css`
- **No router** — view switching is plain `useState` in `App.tsx`

## Project structure

```
src/
├── App.tsx                  # Top-level tab navigation (Schedule / Workers / Shift Types / Tags / Schedules)
├── types.ts                 # All shared TypeScript interfaces
├── index.css                # Global styles (single flat file)
├── components/              # Shared UI primitives (Modal, ConfirmDialog, TagBadge, WorkerBadge, ColorPicker, TagToggleList, ViewModeToggle)
├── features/
│   ├── schedule/            # Main schedule grid, auto-fill, export, bank holidays
│   ├── schedules/           # Schedule definition CRUD (period length, working days)
│   ├── workers/             # Worker CRUD, availability, holidays
│   ├── shifts/              # Shift type CRUD
│   └── tags/                # Tag CRUD
├── store/
│   └── useStore.ts          # Single custom hook — all app state + localStorage persistence
└── utils/
    ├── dates.ts             # Period/date helpers
    ├── autofill.ts          # Greedy auto-fill algorithm
    └── export.ts / pdfWasm.ts  # CSV and PDF export
```

## State management

All state lives in `useStore` (a single custom React hook). There is no external state library. Each data collection (workers, shifts, tags, assignments, etc.) is a `useState` array with a corresponding `useEffect` that persists it to `localStorage`. The hook exposes typed CRUD methods that components call directly.

## Key data model

| Entity | Purpose |
|---|---|
| `Tag` | Skill/qualification label with a colour |
| `Worker` | Team member with tags, per-day availability, and a max-shifts-per-week cap |
| `ShiftType` | Named time slot with required tags and a minimum worker count |
| `Assignment` | Joins a worker, shift, and date |
| `ScheduleDefinition` | Named period template — calendar length and which days of the week are working days |
| `BankHoliday` / `WorkerHoliday` | Date blocks respected by assignment and auto-fill logic |

## Schedule definitions

The active `ScheduleDefinition` drives the schedule view. It sets the period length (e.g. 7 days) and which weekdays are shown as columns. Navigation steps forward/back by that many calendar days, always snapping to the Monday of the current week on first load. The default is "Work Week" (Mon–Fri, 7-day period).

## Auto-fill

`utils/autofill.ts` implements a greedy algorithm. It sorts unfilled slots by the number of eligible workers (hardest first), then assigns the least-loaded eligible worker to each slot, respecting bank holidays, worker holidays, availability windows, and the per-worker shift cap.

## PDF export — Go WASM

PDF generation is handled by a Go module compiled to WebAssembly, not by JavaScript. This keeps the PDF layout logic in Go (using the `go-pdf/fpdf` library) and away from the React bundle.

**How it fits together:**

- `wasm/pdf.go` — pure Go: accepts a `PDFRequest` (shifts, workers, assignments, date range) and returns raw PDF bytes using `fpdf`. Handles layout, text wrapping, colour-coded shift cells, and per-page headers.
- `wasm/main.go` — the WASM entry point. Registers a single global JS function `generateSchedulePDF` and blocks forever so the module stays alive.
- `build-wasm.sh` — compiles `wasm/` with `GOOS=js GOARCH=wasm` to `public/pdf.wasm` and copies the Go runtime shim `wasm_exec.js` from the local Go installation into `public/`.
- `src/utils/pdfWasm.ts` — lazy-loads and instantiates the WASM module on first use (via `WebAssembly.instantiateStreaming`), then calls `window.generateSchedulePDF` with a JSON payload. The function returns base64-encoded PDF bytes which the TypeScript side decodes and triggers as a file download.

**Build requirement:** Go must be installed to rebuild the WASM binary. The pre-built `public/pdf.wasm` and `public/wasm_exec.js` are committed so that the app works without a Go toolchain for regular JS development.

**To rebuild the WASM binary:**
```
./build-wasm.sh
```

## Testing

Tests live alongside the source they cover (`*.test.ts`). Run with `npm test`. There are no component tests — only pure utility and store logic is unit-tested.

## Local development

```
npm install
npm run dev   # dev server at localhost:5173
npm test      # unit tests
npm run build # production build to dist/
```
