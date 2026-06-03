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
import { useT } from '../i18n';
import ConfirmDialog from '../components/ConfirmDialog';

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
  const { t } = useT();
  const FOLLOW_MODES = [
    { value: 'off', label: t('followModes.offTitle') },
    { value: 'auto', label: t('followModes.autoTitle') },
    { value: 'prompt', label: t('followModes.promptTitle') },
  ] as const;
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
  canDelete,
  confirmUnfollow,
  onConfirmUnfollowChange,
  onAccountDeleted,
}: {
  profile: WebProfile;
  editable: boolean;
  canDelete: boolean;
  confirmUnfollow: boolean;
  onConfirmUnfollowChange: (v: boolean) => void;
  onAccountDeleted: () => void;
}) {
  const { t, lang, setLang } = useT();
  const a = profile.account;
  const [newsNotif, setNewsNotif] = useState(a.newsNotifications);
  const [steamNotif, setSteamNotif] = useState(a.steamNotifications);
  const [preferSteam, setPreferSteam] = useState(a.preferSteamWhenOpen);
  const [libMode, setLibMode] = useState(a.libraryFollowMode);
  const [wishMode, setWishMode] = useState(a.wishlistFollowMode);
  const [saving, setSaving] = useState(false);

  const supportLinks = [
    { label: t('contact.email'), url: 'mailto:contact@fouzi-dev.fr' },
    { label: t('contact.github'), url: 'https://github.com/YannisFouzi' },
    { label: t('contact.website'), url: 'https://fouzi-dev.fr/' },
    { label: t('nav.termsOfService'), url: '/terms' },
    { label: t('nav.privacyPolicy'), url: '/privacy' },
  ];
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

  const onLanguage = (code: AppLanguage) => {
    if (!editable || code === lang) return;
    const prev = lang;
    setLang(code); // live UI translation
    setSaving(true);
    updateLanguage(code)
      .catch((err: unknown) => {
        console.error('[GameNews] language save failed', err);
        setLang(prev);
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
        setDeleteError(t('settings.deleteAccountError'));
      });
  };

  const disabled = !editable || saving;

  return (
    <div className="settings">
      {!editable && (
        <div className="hint">{t('web.readOnlyHint')}</div>
      )}

      <div className="settings-group">
        <Toggle
          label={t('web.steamNewsNotif')}
          value={steamNotif}
          disabled={disabled}
          onChange={(v) => {
            setSteamNotif(v);
            persist({ steamNotifications: v }, () => setSteamNotif(!v));
          }}
        />
        <Toggle
          label={t('web.mobileNewsNotif')}
          value={newsNotif}
          disabled={disabled}
          onChange={(v) => {
            setNewsNotif(v);
            persist({ newsNotifications: v }, () => setNewsNotif(!v));
          }}
        />
        <Toggle
          label={t('web.avoidDuplicates')}
          value={preferSteam}
          disabled={disabled}
          onChange={(v) => {
            setPreferSteam(v);
            persist({ preferSteamWhenOpen: v }, () => setPreferSteam(!v));
          }}
        />
        <Toggle
          label={t('settings.confirmUnfollowLabel')}
          value={confirmUnfollow}
          disabled={disabled}
          onChange={(v) => onConfirmUnfollowChange(v)}
        />
      </div>

      <div className="settings-group">
        <div className="settings-group-title">{t('common.autoFollow')}</div>
        <div className="settings-group-desc">{t('settings.autoFollowDescription')}</div>
        <ModeSelect
          label={t('settings.libraryLabel')}
          value={libMode}
          disabled={disabled}
          onChange={(v) => {
            const prev = libMode;
            setLibMode(v);
            persist({ libraryFollowMode: v }, () => setLibMode(prev));
          }}
        />
        <ModeSelect
          label={t('settings.wishlistLabel')}
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
        <div className="settings-group-title">{t('settings.languageLabel')}</div>
        <div className="settings-group-desc">{t('settings.languageDescription')}</div>
        <div className="sort-options">
          {SUPPORTED_LANGUAGES.map((code) => (
            <button
              key={code}
              className={`sort-chip ${lang === code ? 'active' : ''}`}
              disabled={disabled}
              onClick={() => onLanguage(code)}
            >
              {LANGUAGE_NATIVE_LABELS[code]}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-title">{t('settings.feedbackSectionTitle')}</div>
        <FeedbackForm />
      </div>

      <div className="settings-group">
        <div className="settings-group-title">{t('settings.sectionSupportTitle')}</div>
        {supportLinks.map((link) => (
          <button
            key={link.url}
            className="support-row"
            onClick={() => openExternal(link.url)}
          >
            {link.label}
          </button>
        ))}
      </div>

      {canDelete && (
        <div className="settings-group">
          <button
            className="danger-row"
            disabled={deleting}
            onClick={() => setShowDelete(true)}
          >
            {deleting ? t('settings.deleting') : t('settings.deleteAccount')}
          </button>
          {deleteError && <div className="feedback-status err">{deleteError}</div>}
        </div>
      )}

      <div className="settings-footer">{t('settings.aboutVersion')}</div>

      {showDelete && (
        <ConfirmDialog
          title={t('settings.deleteAccountConfirmTitle')}
          message={t('settings.deleteAccountConfirmMessage')}
          confirmLabel={t('common.delete')}
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
  const { t } = useT();
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
      setStatus({ kind: 'err', text: t('feedback.messageTooShort') });
      return;
    }
    if (!EMAIL_REGEX.test(mail)) {
      setStatus({ kind: 'err', text: t('feedback.emailInvalid') });
      return;
    }
    setStatus({ kind: 'sending' });
    submitFeedback({ type, message: msg, email: mail, steamId: CONTEXT.steamId })
      .then(() => {
        setStatus({ kind: 'ok', text: t('feedback.sentMessage') });
        setMessage('');
      })
      .catch((err: unknown) => {
        setStatus({
          kind: 'err',
          text: err instanceof Error ? err.message : t('feedback.sendErrorMessage'),
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
          {t('feedback.types.bug')}
        </button>
        <button
          className={`sort-chip ${type === 'feature' ? 'active' : ''}`}
          onClick={() => setType('feature')}
        >
          {t('feedback.types.feature')}
        </button>
      </div>
      <textarea
        className="feedback-message"
        placeholder={t('feedback.messagePlaceholder')}
        value={message}
        maxLength={5000}
        onChange={(e) => setMessage(e.target.value)}
      />
      <input
        className="search-input"
        type="email"
        placeholder={t('feedback.emailPlaceholder')}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <button className="auth-btn primary" disabled={sending} onClick={submit}>
        {sending ? t('feedback.sending') : t('feedback.send')}
      </button>
      {(status.kind === 'ok' || status.kind === 'err') && (
        <div className={`feedback-status ${status.kind}`}>{status.text}</div>
      )}
    </div>
  );
}
