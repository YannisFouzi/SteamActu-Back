import { useState } from 'react';
import {
  CONTEXT,
  LANGUAGE_NATIVE_LABELS,
  SUPPORTED_LANGUAGES,
  submitFeedback,
  type AppLanguage,
  type WebProfile,
} from '../api';
import {
  deleteAccount,
  updateLanguage,
  updateNotifications,
  type NotificationPatch,
} from '../auth';
import { openExternal } from '../format';
import ConfirmDialog from '../components/ConfirmDialog';

const FOLLOW_MODES = [
  { value: 'off', label: 'Désactivé' },
  { value: 'auto', label: 'Ajout automatique' },
  { value: 'prompt', label: 'Notif. de confirmation' },
] as const;

const SUPPORT_LINKS = [
  { label: 'Contact (email)', url: 'mailto:contact@fouzi-dev.fr' },
  { label: 'GitHub', url: 'https://github.com/YannisFouzi' },
  { label: 'Site web', url: 'https://fouzi-dev.fr/' },
  { label: "Conditions d'utilisation", url: '/terms' },
  { label: 'Politique de confidentialité', url: '/privacy' },
];

function Toggle({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="set-row">
      <span className="set-label">{label}</span>
      <button
        className={`toggle ${value ? 'on' : ''}`}
        disabled={disabled}
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
      >
        <span className="toggle-knob" />
      </button>
    </div>
  );
}

function ModeSelect({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div className="set-block">
      <span className="set-label">{label}</span>
      <div className="sort-options">
        {FOLLOW_MODES.map((m) => (
          <button
            key={m.value}
            className={`sort-chip ${value === m.value ? 'active' : ''}`}
            disabled={disabled}
            onClick={() => onChange(m.value)}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function CompteTab({
  profile,
  editable,
  confirmUnfollow,
  onConfirmUnfollowChange,
  onAccountDeleted,
}: {
  profile: WebProfile;
  editable: boolean;
  confirmUnfollow: boolean;
  onConfirmUnfollowChange: (v: boolean) => void;
  onAccountDeleted: () => void;
}) {
  const a = profile.account;
  const [newsNotif, setNewsNotif] = useState(a.newsNotifications);
  const [steamNotif, setSteamNotif] = useState(a.steamNotifications);
  const [preferSteam, setPreferSteam] = useState(a.preferSteamWhenOpen);
  const [libMode, setLibMode] = useState(a.libraryFollowMode);
  const [wishMode, setWishMode] = useState(a.wishlistFollowMode);
  const [language, setLanguage] = useState(profile.language);
  const [saving, setSaving] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const persist = (patch: NotificationPatch, revert: () => void) => {
    if (!editable) return;
    setSaving(true);
    updateNotifications(patch)
      .catch((err: unknown) => {
        console.error('[GameNews] settings save failed', err);
        revert();
      })
      .finally(() => setSaving(false));
  };

  const onLanguage = (lang: AppLanguage) => {
    if (!editable || lang === language) return;
    const prev = language;
    setLanguage(lang);
    setSaving(true);
    updateLanguage(lang)
      .catch((err: unknown) => {
        console.error('[GameNews] language save failed', err);
        setLanguage(prev);
      })
      .finally(() => setSaving(false));
  };

  const handleDelete = () => {
    setDeleting(true);
    setDeleteError(null);
    deleteAccount()
      .then(() => {
        setShowDelete(false);
        onAccountDeleted();
      })
      .catch((err: unknown) => {
        console.error('[GameNews] delete account failed', err);
        setShowDelete(false);
        setDeleting(false);
        setDeleteError(
          'Une erreur est survenue lors de la suppression de votre compte. Veuillez réessayer.',
        );
      });
  };

  const disabled = !editable || saving;

  return (
    <div className="settings">
      {!editable && (
        <div className="hint">Connexion de ton compte Steam en cours…</div>
      )}

      <div className="settings-group">
        <Toggle
          label="Notifications d'actualités sur Steam"
          value={steamNotif}
          disabled={disabled}
          onChange={(v) => {
            setSteamNotif(v);
            persist({ steamNotifications: v }, () => setSteamNotif(!v));
          }}
        />
        <Toggle
          label="Notifications d'actualités sur Mobile"
          value={newsNotif}
          disabled={disabled}
          onChange={(v) => {
            setNewsNotif(v);
            persist({ newsNotifications: v }, () => setNewsNotif(!v));
          }}
        />
        <Toggle
          label="Éviter les doublons quand Steam est ouvert"
          value={preferSteam}
          disabled={disabled}
          onChange={(v) => {
            setPreferSteam(v);
            persist({ preferSteamWhenOpen: v }, () => setPreferSteam(!v));
          }}
        />
        <Toggle
          label="Confirmer avant de ne plus suivre"
          value={confirmUnfollow}
          disabled={disabled}
          onChange={(v) => onConfirmUnfollowChange(v)}
        />
      </div>

      <div className="settings-group">
        <div className="settings-group-title">Suivi des nouveaux jeux</div>
        <div className="settings-group-desc">
          Choisissez comment gérer le suivi des jeux détectés dans votre
          bibliothèque et votre wishlist.
        </div>
        <ModeSelect
          label="Ma bibliothèque & Steam Famille"
          value={libMode}
          disabled={disabled}
          onChange={(v) => {
            const prev = libMode;
            setLibMode(v);
            persist({ libraryFollowMode: v }, () => setLibMode(prev));
          }}
        />
        <ModeSelect
          label="Ma wishlist"
          value={wishMode}
          disabled={disabled}
          onChange={(v) => {
            const prev = wishMode;
            setWishMode(v);
            persist({ wishlistFollowMode: v }, () => setWishMode(prev));
          }}
        />
      </div>

      <div className="settings-group">
        <div className="settings-group-title">Langue de l'application</div>
        <div className="settings-group-desc">
          Choisissez la langue de l'interface, des actualités jeu demandées et
          des notifications.
        </div>
        <div className="sort-options">
          {SUPPORTED_LANGUAGES.map((code) => (
            <button
              key={code}
              className={`sort-chip ${language === code ? 'active' : ''}`}
              disabled={disabled}
              onClick={() => onLanguage(code)}
            >
              {LANGUAGE_NATIVE_LABELS[code]}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-title">Feedback</div>
        <FeedbackForm />
      </div>

      <div className="settings-group">
        <div className="settings-group-title">Contact et informations légales</div>
        {SUPPORT_LINKS.map((link) => (
          <button
            key={link.url}
            className="support-row"
            onClick={() => openExternal(link.url)}
          >
            {link.label}
          </button>
        ))}
      </div>

      <div className="settings-group">
        <button
          className="danger-row"
          disabled={!editable || deleting}
          onClick={() => setShowDelete(true)}
        >
          {deleting ? 'Suppression...' : 'Supprimer mon compte'}
        </button>
        {deleteError && <div className="feedback-status err">{deleteError}</div>}
      </div>

      <div className="settings-footer">Game News v1.0.0</div>

      {showDelete && (
        <ConfirmDialog
          title="Supprimer mon compte"
          message="Êtes-vous sûr de vouloir supprimer votre compte ? Cette action est irréversible. Toutes vos données seront définitivement supprimées."
          confirmLabel="Supprimer"
          destructive
          busy={deleting}
          onConfirm={handleDelete}
          onCancel={() => setShowDelete(false)}
        />
      )}
    </div>
  );
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function FeedbackForm() {
  const [type, setType] = useState<'bug' | 'feature'>('bug');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<
    { kind: 'idle' | 'sending' } | { kind: 'ok' | 'err'; text: string }
  >({ kind: 'idle' });

  const submit = () => {
    const msg = message.trim();
    const mail = email.trim();
    if (msg.length < 5) {
      setStatus({ kind: 'err', text: 'Ajoutez au moins 5 caractères.' });
      return;
    }
    if (!EMAIL_REGEX.test(mail)) {
      setStatus({ kind: 'err', text: 'Entrez un email valide.' });
      return;
    }
    setStatus({ kind: 'sending' });
    submitFeedback({ type, message: msg, email: mail, steamId: CONTEXT.steamId })
      .then(() => {
        setStatus({ kind: 'ok', text: 'Merci, votre retour a bien été envoyé.' });
        setMessage('');
      })
      .catch((err: unknown) => {
        setStatus({
          kind: 'err',
          text:
            err instanceof Error
              ? err.message
              : "Impossible d'envoyer votre message pour le moment.",
        });
      });
  };

  const sending = status.kind === 'sending';

  return (
    <div className="feedback">
      <div className="sort-options">
        <button
          className={`sort-chip ${type === 'bug' ? 'active' : ''}`}
          onClick={() => setType('bug')}
        >
          Bug
        </button>
        <button
          className={`sort-chip ${type === 'feature' ? 'active' : ''}`}
          onClick={() => setType('feature')}
        >
          Idée
        </button>
      </div>
      <textarea
        className="feedback-message"
        placeholder="Décrivez le problème ou votre suggestion..."
        value={message}
        maxLength={5000}
        onChange={(e) => setMessage(e.target.value)}
      />
      <input
        className="search-input"
        type="email"
        placeholder="Votre email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <button className="auth-btn primary" disabled={sending} onClick={submit}>
        {sending ? 'Envoi...' : 'Envoyer'}
      </button>
      {(status.kind === 'ok' || status.kind === 'err') && (
        <div className={`feedback-status ${status.kind}`}>{status.text}</div>
      )}
    </div>
  );
}
