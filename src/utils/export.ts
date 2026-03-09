import type { Assignment, Worker, ShiftType, Tag } from '../types';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Formats a Date using local time components — avoids UTC vs local-time skew. */
function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Returns every ISO date string from startDate to endDate inclusive using local time (avoids UTC timezone bugs). */
function eachDayInRange(startDate: string, endDate: string): string[] {
  const days: string[] = [];
  const d = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  while (d <= end) {
    days.push(localDateStr(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

/** RFC 4180 CSV cell escaping. */
function escapeCsvCell(value: string): string {
  const str = value.replace(/\n/g, ' ');
  if (str.includes(',') || str.includes('"') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildCsvRows(
  assignments: Assignment[],
  workers: Worker[],
  shifts: ShiftType[],
  tags: Tag[],
  startDate: string,
  endDate: string,
): string {
  const workerMap = new Map(workers.map(w => [w.id, w]));
  const shiftMap = new Map(shifts.map(s => [s.id, s]));
  const tagMap = new Map(tags.map(t => [t.id, t]));

  const days = new Set(eachDayInRange(startDate, endDate));

  const rows = assignments
    .filter(a => days.has(a.date))
    .map(a => {
      const worker = workerMap.get(a.workerId);
      const shift = shiftMap.get(a.shiftId);
      return { a, worker, shift };
    })
    .filter((x): x is { a: Assignment; worker: Worker; shift: ShiftType } =>
      x.worker !== undefined && x.shift !== undefined,
    )
    .sort((x, y) => {
      if (x.a.date < y.a.date) return -1;
      if (x.a.date > y.a.date) return 1;
      if (x.shift.start < y.shift.start) return -1;
      if (x.shift.start > y.shift.start) return 1;
      return x.worker.name.localeCompare(y.worker.name);
    });

  const header = ['date', 'day', 'shift_name', 'shift_start', 'shift_end', 'worker_name', 'worker_role', 'worker_tags', 'notes'];
  const lines = [header.join(',')];

  for (const { a, worker, shift } of rows) {
    const dayName = DAY_NAMES[new Date(a.date + 'T00:00:00').getDay()];
    const workerTagNames = worker.tagIds
      .map(id => tagMap.get(id)?.name ?? '')
      .filter(Boolean)
      .sort()
      .join('; ');
    const cells = [
      escapeCsvCell(a.date),
      escapeCsvCell(dayName),
      escapeCsvCell(shift.name),
      escapeCsvCell(shift.start),
      escapeCsvCell(shift.end),
      escapeCsvCell(worker.name),
      escapeCsvCell(worker.role ?? ''),
      escapeCsvCell(workerTagNames),
      escapeCsvCell(a.notes ?? ''),
    ];
    lines.push(cells.join(','));
  }

  return lines.join('\r\n');
}

export function downloadCsv(csvText: string, filename: string): void {
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function triggerPrint(
  assignments: Assignment[],
  workers: Worker[],
  shifts: ShiftType[],
  tags: Tag[],
  startDate: string,
  endDate: string,
): void {
  const workerMap = new Map(workers.map(w => [w.id, w]));
  const tagMap = new Map(tags.map(t => [t.id, t]));
  const days = eachDayInRange(startDate, endDate);

  // Build table rows: one row per shift
  const shiftRows = shifts.map(shift => {
    const cells = days.map(date => {
      const cellAssignments = assignments.filter(a => a.date === date && a.shiftId === shift.id);
      const names = cellAssignments
        .map(a => workerMap.get(a.workerId)?.name ?? '')
        .filter(Boolean)
        .join('<br>');
      return `<td style="border:1px solid #ccc;padding:6px 8px;vertical-align:top;font-size:12px;min-width:80px">${names || ''}</td>`;
    }).join('');
    const tagNames = shift.requiredTagIds.map(id => tagMap.get(id)?.name ?? '').filter(Boolean).join(', ');
    const shiftLabel = `<strong>${shift.name}</strong><br><span style="color:#666;font-size:11px">${shift.start}–${shift.end}</span>${tagNames ? `<br><span style="color:#888;font-size:10px">${tagNames}</span>` : ''}`;
    return `<tr><td style="border:1px solid #ccc;padding:6px 8px;background:#f8f8f8;white-space:nowrap;font-size:12px">${shiftLabel}</td>${cells}</tr>`;
  }).join('');

  const dayHeaders = days.map(date => {
    const d = new Date(date + 'T00:00:00');
    const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    return `<th style="border:1px solid #ccc;padding:6px 8px;background:#f0f0f0;font-size:12px;white-space:nowrap">${label}</th>`;
  }).join('');

  const startLabel = new Date(startDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const endLabel = new Date(endDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const html = `
    <div style="font-family:sans-serif;padding:16px">
      <h2 style="margin:0 0 12px;font-size:16px">Schedule: ${startLabel} – ${endLabel}</h2>
      <table style="border-collapse:collapse;width:100%">
        <thead>
          <tr>
            <th style="border:1px solid #ccc;padding:6px 8px;background:#f0f0f0;font-size:12px">Shift</th>
            ${dayHeaders}
          </tr>
        </thead>
        <tbody>${shiftRows}</tbody>
      </table>
    </div>
  `;

  const container = document.createElement('div');
  container.className = 'export-print-container';
  container.innerHTML = html;
  document.body.appendChild(container);

  const cleanup = () => {
    if (document.body.contains(container)) document.body.removeChild(container);
  };

  window.addEventListener('afterprint', cleanup, { once: true });
  // Safari fallback
  setTimeout(cleanup, 5000);

  window.print();
}
