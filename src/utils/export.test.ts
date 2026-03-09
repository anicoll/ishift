import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildCsvRows, downloadCsv, triggerPrint } from './export';
import type { Assignment, Worker, ShiftType, Tag } from '../types';

// ── Test data factories ────────────────────────────────────────────────────────

const FULL_AVAIL = Array.from({ length: 7 }, () => ({ start: '00:00', end: '23:59' }));

function makeWorker(overrides: Partial<Worker> = {}): Worker {
  return {
    id: 'w1', name: 'Alice Johnson', role: 'Manager',
    color: '#4f8ef7', tagIds: [], maxShiftsPerWeek: 5,
    availability: FULL_AVAIL, ...overrides,
  };
}

function makeShift(overrides: Partial<ShiftType> = {}): ShiftType {
  return {
    id: 's1', name: 'Morning', start: '06:00', end: '14:00',
    color: '#f9a825', requiredTagIds: [], minWorkers: 1, ...overrides,
  };
}

function makeAssignment(overrides: Partial<Assignment> = {}): Assignment {
  return { id: 'a1', date: '2024-01-01', shiftId: 's1', workerId: 'w1', notes: '', ...overrides };
}

function makeTag(overrides: Partial<Tag> = {}): Tag {
  return { id: 't1', name: 'First Aid', color: '#e0544b', ...overrides };
}

/** Parse the CSV output into rows of cells for easier assertions. */
function parseCsv(csv: string): string[][] {
  return csv.split('\r\n').map(line => line.split(','));
}

// ── buildCsvRows ──────────────────────────────────────────────────────────────

describe('buildCsvRows', () => {
  it('returns only a header row when there are no assignments', () => {
    const csv = buildCsvRows([], [], [], [], '2024-01-01', '2024-01-07');
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(['date', 'day', 'shift_name', 'shift_start', 'shift_end', 'worker_name', 'worker_role', 'worker_tags', 'notes']);
  });

  it('returns only a header row when all assignments are outside the date range', () => {
    const assignment = makeAssignment({ date: '2024-01-15' });
    const csv = buildCsvRows([assignment], [makeWorker()], [makeShift()], [], '2024-01-01', '2024-01-07');
    expect(parseCsv(csv)).toHaveLength(1);
  });

  it('includes assignments on the start date boundary', () => {
    const csv = buildCsvRows([makeAssignment({ date: '2024-01-01' })], [makeWorker()], [makeShift()], [], '2024-01-01', '2024-01-01');
    expect(parseCsv(csv)).toHaveLength(2); // header + 1 data row
  });

  it('includes assignments on the end date boundary', () => {
    const csv = buildCsvRows([makeAssignment({ date: '2024-01-07' })], [makeWorker()], [makeShift()], [], '2024-01-07', '2024-01-07');
    expect(parseCsv(csv)).toHaveLength(2);
  });

  it('outputs correct column values for a single assignment', () => {
    const worker = makeWorker({ name: 'Bob Smith', role: 'Staff' });
    const shift = makeShift({ name: 'Afternoon', start: '14:00', end: '22:00' });
    const assignment = makeAssignment({ date: '2024-01-01', workerId: 'w1', shiftId: 's1', notes: 'cover' });
    const rows = parseCsv(buildCsvRows([assignment], [worker], [shift], [], '2024-01-01', '2024-01-01'));
    const [, data] = rows;
    expect(data[0]).toBe('2024-01-01'); // date
    expect(data[1]).toBe('Monday');     // day (2024-01-01 is a Monday)
    expect(data[2]).toBe('Afternoon'); // shift_name
    expect(data[3]).toBe('14:00');     // shift_start
    expect(data[4]).toBe('22:00');     // shift_end
    expect(data[5]).toBe('Bob Smith'); // worker_name
    expect(data[6]).toBe('Staff');     // worker_role
    expect(data[7]).toBe('');          // worker_tags (none)
    expect(data[8]).toBe('cover');     // notes
  });

  it('uses CRLF line endings', () => {
    const csv = buildCsvRows([makeAssignment()], [makeWorker()], [makeShift()], [], '2024-01-01', '2024-01-01');
    expect(csv).toContain('\r\n');
    expect(csv.split('\r\n')).toHaveLength(2); // header + 1 row
  });

  describe('day names', () => {
    const cases: [string, string][] = [
      ['2024-01-01', 'Monday'],
      ['2024-01-02', 'Tuesday'],
      ['2024-01-03', 'Wednesday'],
      ['2024-01-04', 'Thursday'],
      ['2024-01-05', 'Friday'],
      ['2024-01-06', 'Saturday'],
      ['2024-01-07', 'Sunday'],
    ];
    it.each(cases)('date %s maps to %s', (date, expectedDay) => {
      const rows = parseCsv(buildCsvRows([makeAssignment({ date })], [makeWorker()], [makeShift()], [], date, date));
      expect(rows[1][1]).toBe(expectedDay);
    });
  });

  describe('sorting', () => {
    it('sorts by date ascending', () => {
      const workers = [makeWorker({ id: 'w1' }), makeWorker({ id: 'w2', name: 'Bob' })];
      const shift = makeShift();
      const assignments = [
        makeAssignment({ id: 'a2', date: '2024-01-02', workerId: 'w1' }),
        makeAssignment({ id: 'a1', date: '2024-01-01', workerId: 'w2' }),
      ];
      const rows = parseCsv(buildCsvRows(assignments, workers, [shift], [], '2024-01-01', '2024-01-02'));
      expect(rows[1][0]).toBe('2024-01-01');
      expect(rows[2][0]).toBe('2024-01-02');
    });

    it('sorts by shift start time within the same date', () => {
      const worker = makeWorker();
      const shifts = [
        makeShift({ id: 's1', name: 'Night', start: '22:00', end: '06:00' }),
        makeShift({ id: 's2', name: 'Morning', start: '06:00', end: '14:00' }),
      ];
      const assignments = [
        makeAssignment({ id: 'a1', shiftId: 's1' }),
        makeAssignment({ id: 'a2', shiftId: 's2' }),
      ];
      const rows = parseCsv(buildCsvRows(assignments, [worker], shifts, [], '2024-01-01', '2024-01-01'));
      expect(rows[1][2]).toBe('Morning'); // earlier start first
      expect(rows[2][2]).toBe('Night');
    });

    it('sorts by worker name within same date and shift', () => {
      const workers = [
        makeWorker({ id: 'w1', name: 'Zara' }),
        makeWorker({ id: 'w2', name: 'Alice' }),
      ];
      const shift = makeShift();
      const assignments = [
        makeAssignment({ id: 'a1', workerId: 'w1' }),
        makeAssignment({ id: 'a2', workerId: 'w2' }),
      ];
      const rows = parseCsv(buildCsvRows(assignments, workers, [shift], [], '2024-01-01', '2024-01-01'));
      expect(rows[1][5]).toBe('Alice');
      expect(rows[2][5]).toBe('Zara');
    });
  });

  describe('tag handling', () => {
    it('joins tag names with "; " sorted alphabetically', () => {
      const tags = [
        makeTag({ id: 't1', name: 'Forklift' }),
        makeTag({ id: 't2', name: 'First Aid' }),
      ];
      const worker = makeWorker({ tagIds: ['t1', 't2'] });
      const rows = parseCsv(buildCsvRows([makeAssignment()], [worker], [makeShift()], tags, '2024-01-01', '2024-01-01'));
      expect(rows[1][7]).toBe('First Aid; Forklift'); // alphabetical order
    });

    it('leaves worker_tags empty when worker has no tags', () => {
      const rows = parseCsv(buildCsvRows([makeAssignment()], [makeWorker({ tagIds: [] })], [makeShift()], [], '2024-01-01', '2024-01-01'));
      expect(rows[1][7]).toBe('');
    });

    it('ignores tag IDs that have no matching tag record', () => {
      const worker = makeWorker({ tagIds: ['unknown-tag'] });
      const rows = parseCsv(buildCsvRows([makeAssignment()], [worker], [makeShift()], [], '2024-01-01', '2024-01-01'));
      expect(rows[1][7]).toBe('');
    });
  });

  describe('CSV escaping', () => {
    it('wraps cells containing commas in double quotes', () => {
      const worker = makeWorker({ name: 'Smith, Bob' });
      const csv = buildCsvRows([makeAssignment()], [worker], [makeShift()], [], '2024-01-01', '2024-01-01');
      expect(csv).toContain('"Smith, Bob"');
    });

    it('doubles embedded double-quotes per RFC 4180', () => {
      const worker = makeWorker({ name: 'Alice "A" Johnson' });
      const csv = buildCsvRows([makeAssignment()], [worker], [makeShift()], [], '2024-01-01', '2024-01-01');
      expect(csv).toContain('"Alice ""A"" Johnson"');
    });

    it('replaces newlines in notes with a space', () => {
      const assignment = makeAssignment({ notes: 'line1\nline2' });
      const csv = buildCsvRows([assignment], [makeWorker()], [makeShift()], [], '2024-01-01', '2024-01-01');
      expect(csv).toContain('line1 line2');
      expect(csv).not.toContain('\nline2');
    });

    it('does not quote plain alphanumeric values', () => {
      const rows = parseCsv(buildCsvRows([makeAssignment()], [makeWorker()], [makeShift()], [], '2024-01-01', '2024-01-01'));
      // None of the simple values should be wrapped in quotes
      expect(rows[1][0]).toBe('2024-01-01');
      expect(rows[1][5]).toBe('Alice Johnson');
    });
  });

  describe('data integrity', () => {
    it('excludes assignments whose workerId has no matching worker', () => {
      const assignment = makeAssignment({ workerId: 'deleted-worker' });
      const csv = buildCsvRows([assignment], [], [makeShift()], [], '2024-01-01', '2024-01-01');
      expect(parseCsv(csv)).toHaveLength(1); // header only
    });

    it('excludes assignments whose shiftId has no matching shift', () => {
      const assignment = makeAssignment({ shiftId: 'deleted-shift' });
      const csv = buildCsvRows([assignment], [makeWorker()], [], [], '2024-01-01', '2024-01-01');
      expect(parseCsv(csv)).toHaveLength(1); // header only
    });

    it('handles empty notes without quoting', () => {
      const assignment = makeAssignment({ notes: '' });
      const rows = parseCsv(buildCsvRows([assignment], [makeWorker()], [makeShift()], [], '2024-01-01', '2024-01-01'));
      expect(rows[1][8]).toBe('');
    });

    it('handles empty role without quoting', () => {
      const worker = makeWorker({ role: '' });
      const rows = parseCsv(buildCsvRows([makeAssignment()], [worker], [makeShift()], [], '2024-01-01', '2024-01-01'));
      expect(rows[1][6]).toBe('');
    });
  });
});

// ── downloadCsv ───────────────────────────────────────────────────────────────

describe('downloadCsv', () => {
  const mockClick = vi.fn();
  const mockRevokeObjectURL = vi.fn();
  const fakeUrl = 'blob:fake-url';

  beforeEach(() => {
    mockClick.mockReset();
    mockRevokeObjectURL.mockReset();

    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => fakeUrl),
      revokeObjectURL: mockRevokeObjectURL,
    });

    vi.stubGlobal('Blob', class {
      parts: unknown[];
      options: unknown;
      constructor(parts: unknown[], options: unknown) {
        this.parts = parts;
        this.options = options;
      }
    });

    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({
        href: '',
        download: '',
        click: mockClick,
      })),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('triggers a click on an anchor element', () => {
    downloadCsv('a,b\r\n1,2', 'schedule.csv');
    expect(mockClick).toHaveBeenCalledOnce();
  });

  it('sets the download filename on the anchor', () => {
    const anchor = { href: '', download: '', click: mockClick };
    vi.stubGlobal('document', { createElement: vi.fn(() => anchor) });
    downloadCsv('a,b', 'my-schedule.csv');
    expect(anchor.download).toBe('my-schedule.csv');
  });

  it('sets the href to the object URL', () => {
    const anchor = { href: '', download: '', click: mockClick };
    vi.stubGlobal('document', { createElement: vi.fn(() => anchor) });
    downloadCsv('a,b', 'schedule.csv');
    expect(anchor.href).toBe(fakeUrl);
  });

  it('revokes the object URL after clicking', () => {
    downloadCsv('a,b', 'schedule.csv');
    expect(mockRevokeObjectURL).toHaveBeenCalledWith(fakeUrl);
  });
});

// ── triggerPrint ──────────────────────────────────────────────────────────────

describe('triggerPrint', () => {
  const mockPrint = vi.fn();
  const mockAppendChild = vi.fn();
  const mockContains = vi.fn(() => false);
  const mockAddEventListener = vi.fn();

  let fakeContainer: { className: string; innerHTML: string };

  beforeEach(() => {
    mockPrint.mockReset();
    mockAppendChild.mockReset();
    mockAddEventListener.mockReset();
    fakeContainer = { className: '', innerHTML: '' };

    vi.stubGlobal('document', {
      createElement: vi.fn(() => fakeContainer),
      body: {
        appendChild: mockAppendChild,
        contains: mockContains,
        removeChild: vi.fn(),
      },
    });

    vi.stubGlobal('window', {
      print: mockPrint,
      addEventListener: mockAddEventListener,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls window.print()', () => {
    triggerPrint([], [], [], [], '2024-01-01', '2024-01-07');
    expect(mockPrint).toHaveBeenCalledOnce();
  });

  it('appends a container element to document.body', () => {
    triggerPrint([], [], [], [], '2024-01-01', '2024-01-07');
    expect(mockAppendChild).toHaveBeenCalledWith(fakeContainer);
  });

  it('sets the container class to export-print-container', () => {
    triggerPrint([], [], [], [], '2024-01-01', '2024-01-07');
    expect(fakeContainer.className).toBe('export-print-container');
  });

  it('registers an afterprint listener for cleanup', () => {
    triggerPrint([], [], [], [], '2024-01-01', '2024-01-07');
    expect(mockAddEventListener).toHaveBeenCalledWith('afterprint', expect.any(Function), { once: true });
  });

  it('includes the date range heading in the HTML', () => {
    triggerPrint([], [], [], [], '2024-01-01', '2024-01-07');
    expect(fakeContainer.innerHTML).toContain('Jan 1, 2024');
    expect(fakeContainer.innerHTML).toContain('Jan 7, 2024');
  });

  it('includes shift name and time in the HTML when a shift is provided', () => {
    const shift = makeShift({ name: 'Night', start: '22:00', end: '06:00' });
    triggerPrint([], [], [shift], [], '2024-01-01', '2024-01-01');
    expect(fakeContainer.innerHTML).toContain('Night');
    expect(fakeContainer.innerHTML).toContain('22:00–06:00');
  });

  it('includes assigned worker names in the HTML', () => {
    const worker = makeWorker({ name: 'Carol White' });
    const assignment = makeAssignment({ workerId: 'w1', shiftId: 's1', date: '2024-01-01' });
    const shift = makeShift();
    triggerPrint([assignment], [worker], [shift], [], '2024-01-01', '2024-01-01');
    expect(fakeContainer.innerHTML).toContain('Carol White');
  });
});
