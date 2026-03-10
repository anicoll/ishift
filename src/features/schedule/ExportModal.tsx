import { useState, useMemo } from 'react';
import type { Assignment, Worker, ShiftType, Tag } from '../../types';
import { Modal } from '../../components/Modal';
import { buildCsvRows, downloadCsv, triggerPrint } from '../../utils/export';

interface Props {
  open: boolean;
  defaultStart: string;
  defaultEnd: string;
  assignments: Assignment[];
  workers: Worker[];
  shifts: ShiftType[];
  tags: Tag[];
  onClose: () => void;
}

export function ExportModal({ open, defaultStart, defaultEnd, assignments, workers, shifts, tags, onClose }: Props) {
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);

  // Sync defaults when modal opens with a new week
  const effectiveStart = startDate || defaultStart;
  const effectiveEnd = endDate || defaultEnd;
  const isValidRange = effectiveStart <= effectiveEnd;

  const rangeCount = useMemo(() => {
    if (!isValidRange) return 0;
    return assignments.filter(a => a.date >= effectiveStart && a.date <= effectiveEnd).length;
  }, [assignments, effectiveStart, effectiveEnd, isValidRange]);

  const isLargeRange = useMemo(() => {
    if (!isValidRange) return false;
    const start = new Date(effectiveStart + 'T00:00:00');
    const end = new Date(effectiveEnd + 'T00:00:00');
    const days = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    return days > 31;
  }, [effectiveStart, effectiveEnd, isValidRange]);

  function handleDownloadCsv() {
    const csv = buildCsvRows(assignments, workers, shifts, tags, effectiveStart, effectiveEnd);
    const filename = `schedule_${effectiveStart}_to_${effectiveEnd}.csv`;
    downloadCsv(csv, filename);
    onClose();
  }

  function handlePrint() {
    triggerPrint(assignments, workers, shifts, tags, effectiveStart, effectiveEnd);
    onClose();
  }

  return (
    <Modal title="Export Schedule" open={open} onClose={onClose}>
      <div className="export-modal">
        <div className="form__row">
          <label className="form__label">
            Start Date
            <input
              className="form__input"
              type="date"
              value={effectiveStart}
              onChange={e => setStartDate(e.target.value)}
            />
          </label>
          <label className="form__label">
            End Date
            <input
              className="form__input"
              type="date"
              value={effectiveEnd}
              min={effectiveStart}
              onChange={e => setEndDate(e.target.value)}
            />
          </label>
        </div>

        {!isValidRange && (
          <p className="form__warning">End date must be on or after start date.</p>
        )}

        {isValidRange && (
          <p className="export-modal__count">
            {rangeCount === 0
              ? 'No assignments in this range — CSV will contain headers only.'
              : `${rangeCount} assignment${rangeCount !== 1 ? 's' : ''} in range.`}
          </p>
        )}

        {isLargeRange && (
          <p className="export-modal__warn">
            The selected range is over 31 days. Printing may produce many pages.
          </p>
        )}

        <div className="form__footer">
          <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn btn--ghost"
            disabled={!isValidRange}
            onClick={handlePrint}
          >
            Print / Save as PDF
          </button>
          <button
            className="btn btn--primary"
            disabled={!isValidRange}
            onClick={handleDownloadCsv}
          >
            Download CSV
          </button>
        </div>
      </div>
    </Modal>
  );
}
