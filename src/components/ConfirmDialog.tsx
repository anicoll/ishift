import { Modal } from './Modal';

interface ConfirmDialogProps {
  open: boolean;
  message: string;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({ open, message, onConfirm, onClose }: ConfirmDialogProps) {
  return (
    <Modal title="Confirm Delete" open={open} onClose={onClose} size="sm">
      <p className="confirm__message">{message}</p>
      <div className="form__footer">
        <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn--danger" onClick={() => { onConfirm(); onClose(); }}>
          Delete
        </button>
      </div>
    </Modal>
  );
}
