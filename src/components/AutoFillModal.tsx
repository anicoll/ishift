import type { Worker, ShiftType } from '../types';
import type { AutoFillResult } from '../utils/autofill';
import { Modal } from './Modal';
import { WorkerBadge } from './WorkerBadge';

interface Props {
  open: boolean;
  result: AutoFillResult | null;
  workers: Worker[];
  shifts: ShiftType[];
  onConfirm: () => void;
  onClose: () => void;
}

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

export function AutoFillModal({ open, result, workers, onConfirm, onClose }: Props) {
  if (!result) return null;

  const totalAssigned = result.assignments.length;
  const totalUnfilled = result.slots.reduce((s, sl) => s + sl.unfilledCount, 0);
  const isEmpty = totalAssigned === 0 && totalUnfilled === 0;

  return (
    <Modal title="Auto-fill Preview" open={open} onClose={onClose}>
      <div className="autofill">

        {isEmpty ? (
          <p className="autofill__empty">
            All shift slots are already fully staffed for this week.
          </p>
        ) : (
          <>
            <div className="autofill__summary">
              {totalAssigned > 0 && (
                <span className="autofill__stat autofill__stat--ok">
                  {totalAssigned} assignment{totalAssigned !== 1 ? 's' : ''} to add
                </span>
              )}
              {totalUnfilled > 0 && (
                <span className="autofill__stat autofill__stat--warn">
                  {totalUnfilled} slot{totalUnfilled !== 1 ? 's' : ''} could not be filled
                </span>
              )}
            </div>

            <div className="autofill__list">
              {result.slots.map((slot, i) => {
                const workerMap = new Map(workers.map(w => [w.id, w]));
                return (
                  <div key={i} className="autofill__row">
                    <div className="autofill__row-header">
                      <span
                        className="autofill__shift-dot"
                        style={{ backgroundColor: slot.shift.color }}
                      />
                      <span className="autofill__shift-name">{slot.shift.name}</span>
                      <span className="autofill__date">{formatDate(slot.date)}</span>
                    </div>
                    <div className="autofill__row-body">
                      {slot.toAssign.length > 0 ? (
                        slot.toAssign.map(w => {
                          const worker = workerMap.get(w.id);
                          return worker ? (
                            <WorkerBadge key={w.id} worker={worker} />
                          ) : null;
                        })
                      ) : null}
                      {slot.unfilledCount > 0 && (
                        <span className="autofill__unfilled">
                          ⚠ {slot.unfilledCount} slot{slot.unfilledCount !== 1 ? 's' : ''} unfilled — no eligible workers available
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div className="form__footer">
          <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
          {totalAssigned > 0 && (
            <button
              className="btn btn--primary"
              onClick={() => { onConfirm(); onClose(); }}
            >
              Apply {totalAssigned} Assignment{totalAssigned !== 1 ? 's' : ''}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
