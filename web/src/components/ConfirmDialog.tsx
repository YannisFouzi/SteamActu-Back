import { useState } from 'react';

// Modal confirmation, mirrors the mobile showDialog: title + message, an
// optional "don't ask again" checkbox, and a (optionally destructive) confirm
// button. onConfirm receives the checkbox state.
export default function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel = 'Annuler',
  destructive = false,
  checkboxLabel,
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  checkboxLabel?: string;
  busy?: boolean;
  onConfirm: (dontAskAgain: boolean) => void;
  onCancel: () => void;
}) {
  const [checked, setChecked] = useState(false);

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-title">{title}</div>
        <div className="modal-message">{message}</div>
        {checkboxLabel && (
          <label className="modal-check">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
            />
            <span>{checkboxLabel}</span>
          </label>
        )}
        <div className="modal-actions">
          <button className="modal-btn ghost" disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            className={`modal-btn ${destructive ? 'danger' : 'primary'}`}
            disabled={busy}
            onClick={() => onConfirm(checked)}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
