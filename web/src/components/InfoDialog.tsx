import { useT } from '../i18n';

// Single-OK informational modal — the web twin of the mobile showDialog used by
// the "Vérifier mon profil" result (success / still-private). Reuses the .modal*
// styling. The message can contain \n (the i18n strings do) → rendered with
// white-space: pre-line so the line breaks survive.
export default function InfoDialog({
  title,
  message,
  onClose,
}: {
  title: string;
  message: string;
  onClose: () => void;
}) {
  const { t } = useT();
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-title">{title}</div>
        <div className="modal-message pre-line">{message}</div>
        <div className="modal-actions">
          <button className="modal-btn primary" onClick={onClose}>
            {t('common.ok')}
          </button>
        </div>
      </div>
    </div>
  );
}
