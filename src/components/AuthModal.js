import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import './AuthModal.css';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../contexts/ConfirmContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getTranslation } from '../utils/translations';
import { shareErrorKey } from '../utils/shareErrors';

const KNOWN_ERROR_CODES = new Set([
  'INVALID_CREDENTIALS',
  'ACCOUNT_DISABLED',
  'USERNAME_EXISTS',
  'INVALID_USERNAME',
  'WEAK_PASSWORD',
  'PASSWORD_MISMATCH',
  'SAME_PASSWORD',
  'INVALID_SECURITY_QUESTION',
  'WEAK_SECURITY_ANSWER',
  'INVALID_FORGOT',
  'INVALID_CONTACT',
  'RATE_LIMITED',
  'NETWORK_ERROR',
]);

const USERNAME_RE = /^[A-Za-z0-9_.]{3,32}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const X_HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;

const normalizeForgotContact = (channel, value) => {
  const ch = channel === 'x' ? 'x' : 'email';
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (ch === 'email') {
    if (!EMAIL_RE.test(raw) || raw.length > 254) return null;
    return { channel: 'email', value: raw };
  }
  const handle = raw.replace(/^@/, '');
  if (!X_HANDLE_RE.test(handle)) return null;
  return { channel: 'x', value: `@${handle}` };
};

const SECURITY_QUESTIONS = [
  { id: 'favorite_color', labelKey: 'auth.securityQ.favoriteColor' },
  { id: 'favorite_food', labelKey: 'auth.securityQ.favoriteFood' },
  { id: 'childhood_city', labelKey: 'auth.securityQ.childhoodCity' },
  { id: 'lucky_number', labelKey: 'auth.securityQ.luckyNumber' },
];

const LEGACY_QUESTION_LABELS = {
  first_teacher: 'auth.securityQ.firstTeacher',
};

const questionLabelKey = (id) =>
  SECURITY_QUESTIONS.find((q) => q.id === id)?.labelKey ||
  LEGACY_QUESTION_LABELS[id] ||
  'auth.securityQuestion';

const errorKey = (code) => `auth.error.${KNOWN_ERROR_CODES.has(code) ? code : 'GENERIC'}`;

const fill = (text, params) =>
  Object.entries(params || {}).reduce((acc, [k, v]) => acc.replace(`{${k}}`, v), text);

/**
 * Hesap penceresi.
 * - Çıkış yapılmışsa: "Giriş Yap" / "Hesap Oluştur" sekmeleri (kullanıcı adı + şifre)
 * - Giriş yapılmışsa: kullanıcı adı, eşitleme durumu, paylaşımlar, "Şimdi eşitle", "Çıkış"
 */
const AuthModal = ({ open, onClose, syncStatus = 'idle', onSyncNow, shares, onOpenStats }) => {
  const {
    user,
    login,
    register,
    logout,
    deleteAccount,
    changePassword,
    requestForgotPassword,
    fetchSecurityQuestion,
  } = useAuth();
  const { notify } = useToast();
  const { confirm } = useConfirm();
  const { language } = useLanguage();
  const t = (key, params) => fill(getTranslation(key, language), params);
  const roleLabel = (role) => (role === 'view' ? `👁 ${t('share.roleView')}` : `✏️ ${t('share.roleEdit')}`);
  const [shareMessage, setShareMessage] = useState(null); // { kind: 'ok'|'error', text }

  const runShareAction = async (action) => {
    setShareMessage(null);
    try {
      await action();
    } catch (error) {
      setShareMessage({ kind: 'error', text: t(shareErrorKey(error?.code)) });
    }
  };

  const [mode, setMode] = useState('login'); // login | register | forgot | changePassword
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [securityQuestionId, setSecurityQuestionId] = useState(SECURITY_QUESTIONS[0].id);
  const [securityAnswer, setSecurityAnswer] = useState('');
  const [forgotQuestionId, setForgotQuestionId] = useState(null);
  const [contactChannel, setContactChannel] = useState('email'); // email | x
  const [contactValue, setContactValue] = useState('');
  const [errorCode, setErrorCode] = useState(null);
  const [busy, setBusy] = useState(false);

  const mustChange = Boolean(user?.mustChangePassword);

  useEffect(() => {
    if (!open) return undefined;
    // Yalnızca modal açılınca listeyi tazele (onClose her render'da değişmesin diye ayrı effect)
    shares?.refresh?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    setErrorCode(null);
    setShareMessage(null);
    setBusy(false);
    setPassword('');
    setPasswordConfirm('');
    // mustChange geçişinde mevcut şifreyi silme (login sonrası otomatik doldurulur)
    if (!user?.mustChangePassword) {
      setCurrentPassword('');
      setNewPassword('');
      setNewPasswordConfirm('');
    }
    setSecurityAnswer('');
    setForgotQuestionId(null);
    setContactChannel('email');
    setContactValue('');
    if (user?.mustChangePassword) {
      setMode('changePassword');
    } else if (user) {
      setMode('login');
    }
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && !user?.mustChangePassword) onClose?.();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user?.mustChangePassword, user?.id]);

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setErrorCode(null);

    const trimmedUsername = username.trim();
    if (!USERNAME_RE.test(trimmedUsername)) {
      setErrorCode('INVALID_USERNAME');
      return;
    }
    if (password.length < 8) {
      setErrorCode('WEAK_PASSWORD');
      return;
    }
    if (mode === 'register' && password !== passwordConfirm) {
      setErrorCode('PASSWORD_MISMATCH');
      return;
    }
    if (mode === 'register') {
      if (!securityQuestionId) {
        setErrorCode('INVALID_SECURITY_QUESTION');
        return;
      }
      if (securityAnswer.trim().length < 1) {
        setErrorCode('WEAK_SECURITY_ANSWER');
        return;
      }
    }

    setBusy(true);
    try {
      if (mode === 'login') {
        const nextUser = await login(trimmedUsername, password);
        notify({ kind: 'success', text: t('notify.loggedIn', { username: trimmedUsername }) });
        if (nextUser?.mustChangePassword) {
          setMode('changePassword');
          setCurrentPassword(password);
          setPassword('');
          return;
        }
        onClose?.();
      } else {
        await register(trimmedUsername, password, securityQuestionId, securityAnswer.trim());
        notify({ kind: 'success', text: t('notify.registered', { username: trimmedUsername }) });
        onClose?.();
      }
    } catch (error) {
      setErrorCode(error?.code || 'GENERIC');
    } finally {
      setBusy(false);
    }
  };

  const handleForgotLookup = async (e) => {
    e.preventDefault();
    if (busy) return;
    setErrorCode(null);
    const trimmedUsername = username.trim();
    if (!USERNAME_RE.test(trimmedUsername)) {
      setErrorCode('INVALID_USERNAME');
      return;
    }
    setBusy(true);
    try {
      const qid = await fetchSecurityQuestion(trimmedUsername);
      setForgotQuestionId(qid);
      if (!qid) {
        notify({ kind: 'info', text: t('auth.forgotNoQuestion') });
      }
    } catch (error) {
      setErrorCode(error?.code || 'GENERIC');
    } finally {
      setBusy(false);
    }
  };

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setErrorCode(null);
    const trimmedUsername = username.trim();
    if (!USERNAME_RE.test(trimmedUsername) || securityAnswer.trim().length < 1) {
      setErrorCode('INVALID_FORGOT');
      return;
    }
    const contact = normalizeForgotContact(contactChannel, contactValue);
    if (!contact) {
      setErrorCode('INVALID_CONTACT');
      return;
    }
    setBusy(true);
    try {
      await requestForgotPassword(trimmedUsername, securityAnswer.trim(), contact);
      notify({ kind: 'success', text: t('auth.forgotSent') });
      setMode('login');
      setSecurityAnswer('');
      setForgotQuestionId(null);
      setContactValue('');
      setContactChannel('email');
    } catch (error) {
      setErrorCode(error?.code || 'GENERIC');
    } finally {
      setBusy(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (busy) return;
    setErrorCode(null);
    if (newPassword.length < 8) {
      setErrorCode('WEAK_PASSWORD');
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      setErrorCode('PASSWORD_MISMATCH');
      return;
    }
    setBusy(true);
    try {
      await changePassword(currentPassword, newPassword);
      notify({ kind: 'success', text: t('auth.passwordChanged') });
      setCurrentPassword('');
      setNewPassword('');
      setNewPasswordConfirm('');
      setMode('login');
      onClose?.();
    } catch (error) {
      setErrorCode(error?.code || 'GENERIC');
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await logout();
      notify({ kind: 'info', text: t('notify.loggedOut') });
      onClose?.();
    } catch (error) {
      setErrorCode(error?.code || 'GENERIC');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (busy) return;
    const ok = await confirm({
      title: t('dialog.title.deleteAccount'),
      message: t('auth.deleteAccountConfirm', { username: user?.username || '' }),
      confirmLabel: t('dialog.delete'),
      cancelLabel: t('dialog.cancel'),
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    setErrorCode(null);
    try {
      await deleteAccount();
      notify({ kind: 'info', text: t('notify.accountDeleted') });
      onClose?.();
    } catch (error) {
      setErrorCode(error?.code || 'GENERIC');
      notify({ kind: 'error', text: t(errorKey(error?.code || 'GENERIC')) });
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (nextMode) => {
    if (nextMode === mode) return;
    setMode(nextMode);
    setErrorCode(null);
    setPasswordConfirm('');
    setSecurityAnswer('');
    setForgotQuestionId(null);
    setContactChannel('email');
    setContactValue('');
    setCurrentPassword('');
    setNewPassword('');
    setNewPasswordConfirm('');
  };

  const changePasswordForm = (
    <form className="auth-modal-body" onSubmit={handleChangePassword} noValidate>
      {mustChange && (
        <p className="auth-modal-hint auth-modal-hint--warn">{t('auth.mustChangePassword')}</p>
      )}
      <label className="auth-field">
        <span>{t('auth.currentPassword')}</span>
        <input
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
        />
      </label>
      <label className="auth-field">
        <span>{t('auth.newPassword')}</span>
        <input
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          minLength={8}
        />
      </label>
      <label className="auth-field">
        <span>{t('auth.newPasswordConfirm')}</span>
        <input
          type="password"
          autoComplete="new-password"
          value={newPasswordConfirm}
          onChange={(e) => setNewPasswordConfirm(e.target.value)}
          required
          minLength={8}
        />
      </label>
      {errorCode && <p className="auth-modal-error">{t(errorKey(errorCode))}</p>}
      <button type="submit" className="auth-btn auth-btn--primary" disabled={busy}>
        {busy ? t('auth.processing') : t('auth.changePassword')}
      </button>
      {!mustChange && (
        <button
          type="button"
          className="auth-btn auth-btn--secondary"
          disabled={busy}
          onClick={() => setMode('login')}
        >
          {t('auth.back')}
        </button>
      )}
    </form>
  );

  const content = user && (mustChange || mode === 'changePassword') ? (
    changePasswordForm
  ) : user ? (
    <div className="auth-modal-body">
      <p className="auth-modal-user">
        <span className="auth-modal-label">{t('auth.loggedInAs')}</span>
        <strong>{user.username}</strong>
      </p>
      <p className={`auth-modal-status auth-modal-status--${syncStatus}`}>
        {t(`auth.status.${syncStatus}`)}
      </p>

      {shares && (
        <div className="auth-shares">
          <p className="auth-shares-title">{t('share.title')}</p>
          <p className="auth-modal-hint">{t('share.hint')}</p>

          {shares.incoming.length === 0 &&
            shares.outgoing.length === 0 &&
            (shares.members?.length || 0) === 0 &&
            (shares.sharedWithMe?.length || 0) === 0 && (
              <p className="auth-shares-empty">{t('share.empty')}</p>
            )}

          {shares.incoming.length > 0 && (
            <ul className="auth-share-list">
              {shares.incoming.map((s) => (
                <li key={s.id} className="auth-share-item">
                  <div className="auth-share-text">
                    <strong>{s.binderName}</strong>
                    <span>
                      {t('share.from', { username: s.fromUsername })} · {roleLabel(s.role)}
                    </span>
                  </div>
                  <div className="auth-share-actions">
                    <button
                      type="button"
                      className="auth-share-btn auth-share-btn--accept"
                      disabled={shares.busyId === s.id}
                      onClick={() =>
                        runShareAction(async () => {
                          await shares.accept(s.id);
                          setShareMessage({ kind: 'ok', text: t('share.accepted', { name: s.binderName }) });
                          notify({ kind: 'success', text: t('notify.shareAccepted', { name: s.binderName }) });
                        })
                      }
                    >
                      {t('share.accept')}
                    </button>
                    <button
                      type="button"
                      className="auth-share-btn auth-share-btn--reject"
                      disabled={shares.busyId === s.id}
                      onClick={() =>
                        runShareAction(async () => {
                          await shares.reject(s.id);
                          notify({ kind: 'info', text: t('notify.shareRejected') });
                        })
                      }
                    >
                      {t('share.reject')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {shares.outgoing.length > 0 && (
            <ul className="auth-share-list">
              {shares.outgoing.map((s) => (
                <li key={s.id} className="auth-share-item">
                  <div className="auth-share-text">
                    <strong>{s.binderName}</strong>
                    <span>
                      {t('share.to', { username: s.toUsername })} · {roleLabel(s.role)}
                    </span>
                  </div>
                  <div className="auth-share-actions">
                    <button
                      type="button"
                      className="auth-share-btn auth-share-btn--cancel"
                      disabled={shares.busyId === s.id}
                      onClick={() =>
                        runShareAction(async () => {
                          await shares.cancel(s.id);
                          notify({ kind: 'info', text: t('notify.shareCancelled') });
                        })
                      }
                    >
                      {t('share.cancel')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* Benim binder'larıma erişimi olan kullanıcılar (sahip: kaldır) */}
          {shares.members?.length > 0 && (
            <>
              <p className="auth-shares-subtitle">{t('share.membersTitle')}</p>
              <ul className="auth-share-list">
                {shares.members.map((m) => {
                  const busyKey = `${m.binderId}:${m.userId}`;
                  return (
                    <li key={busyKey} className="auth-share-item">
                      <div className="auth-share-text">
                        <strong>{m.binderName}</strong>
                        <span>
                          {t('share.memberOf', { username: m.username })} · {roleLabel(m.role)}
                        </span>
                      </div>
                      <div className="auth-share-actions">
                        <button
                          type="button"
                          className="auth-share-btn auth-share-btn--role"
                          disabled={shares.busyId === busyKey}
                          title={t('share.changeRole')}
                          onClick={() =>
                            runShareAction(async () => {
                              const nextRole = m.role === 'view' ? 'edit' : 'view';
                              await shares.setMemberRole(m.binderId, m.userId, nextRole);
                              notify({
                                kind: 'success',
                                text: t('notify.roleChanged', {
                                  username: m.username,
                                  role: nextRole === 'view' ? t('share.roleView') : t('share.roleEdit'),
                                }),
                              });
                            })
                          }
                        >
                          {m.role === 'view' ? `✏️ ${t('share.roleEdit')}` : `👁 ${t('share.roleView')}`}
                        </button>
                        <button
                          type="button"
                          className="auth-share-btn auth-share-btn--cancel"
                          disabled={shares.busyId === busyKey}
                          onClick={async () => {
                            const ok = await confirm({
                              title: t('dialog.title.removeMember'),
                              message: t('share.removeConfirm', { username: m.username }),
                              confirmLabel: t('dialog.remove'),
                              cancelLabel: t('dialog.cancel'),
                              danger: true,
                            });
                            if (!ok) return;
                            runShareAction(async () => {
                              await shares.removeMember(m.binderId, m.userId);
                              notify({ kind: 'info', text: t('notify.memberRemoved', { username: m.username }) });
                            });
                          }}
                        >
                          {t('share.remove')}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {/* Bana paylaşılan binder'lar (üye: ayrıl) */}
          {shares.sharedWithMe?.length > 0 && (
            <>
              <p className="auth-shares-subtitle">{t('share.sharedWithMeTitle')}</p>
              <ul className="auth-share-list">
                {shares.sharedWithMe.map((m) => {
                  const busyKey = `leave:${m.binderId}`;
                  return (
                    <li key={m.binderId} className="auth-share-item">
                      <div className="auth-share-text">
                        <strong>{m.binderName}</strong>
                        <span>
                          {t('share.ownedBy', { username: m.ownerUsername })} · {roleLabel(m.role)}
                        </span>
                      </div>
                      <div className="auth-share-actions">
                        <button
                          type="button"
                          className="auth-share-btn auth-share-btn--cancel"
                          disabled={shares.busyId === busyKey}
                          onClick={async () => {
                            const ok = await confirm({
                              title: t('dialog.title.leaveBinder'),
                              message: t('binder.leaveSharedConfirm'),
                              confirmLabel: t('dialog.leave'),
                              cancelLabel: t('dialog.cancel'),
                              danger: true,
                            });
                            if (!ok) return;
                            runShareAction(async () => {
                              await shares.leave(m.binderId);
                              notify({ kind: 'info', text: t('notify.leftShare', { name: m.binderName }) });
                            });
                          }}
                        >
                          {t('share.leave')}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {shareMessage && (
            <p className={shareMessage.kind === 'ok' ? 'auth-modal-ok' : 'auth-modal-error'}>
              {shareMessage.text}
            </p>
          )}
        </div>
      )}

      {errorCode && <p className="auth-modal-error">{t(errorKey(errorCode))}</p>}
      {user?.isAdmin && onOpenStats && (
        <button
          type="button"
          className="auth-btn auth-btn--secondary auth-stats-btn"
          onClick={() => onOpenStats()}
          disabled={busy}
        >
          📊 {t('stats.title')}
        </button>
      )}
      <button
        type="button"
        className="auth-btn auth-btn--secondary auth-stats-btn"
        onClick={() => setMode('changePassword')}
        disabled={busy}
      >
        🔑 {t('auth.changePassword')}
      </button>
      <div className="auth-modal-actions">
        <button
          type="button"
          className="auth-btn auth-btn--secondary"
          onClick={() => onSyncNow?.()}
          disabled={busy || syncStatus === 'syncing'}
        >
          ↻ {t('auth.syncNow')}
        </button>
        <button
          type="button"
          className="auth-btn auth-btn--danger"
          onClick={handleLogout}
          disabled={busy}
        >
          {t('auth.logout')}
        </button>
      </div>
      <div className="auth-danger-zone">
        <p className="auth-danger-zone-hint">{t('auth.deleteAccountHint')}</p>
        <button
          type="button"
          className="auth-btn auth-btn--danger-outline"
          onClick={handleDeleteAccount}
          disabled={busy}
        >
          {t('auth.deleteAccount')}
        </button>
      </div>
    </div>
  ) : mode === 'forgot' ? (
    <>
      <form
        className="auth-modal-body"
        onSubmit={forgotQuestionId ? handleForgotSubmit : handleForgotLookup}
        noValidate
      >
        <p className="auth-modal-hint">{t('auth.forgotHint')}</p>
        <label className="auth-field">
          <span>{t('auth.username')}</span>
          <input
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              setForgotQuestionId(null);
            }}
            placeholder={t('auth.usernamePlaceholder')}
            required
            autoFocus
          />
        </label>
        {forgotQuestionId && (
          <>
            <p className="auth-security-question">
              {t(questionLabelKey(forgotQuestionId))}
            </p>
            <label className="auth-field">
              <span>{t('auth.securityAnswer')}</span>
              <input
                type="text"
                autoComplete="off"
                value={securityAnswer}
                onChange={(e) => setSecurityAnswer(e.target.value)}
                required
                minLength={1}
              />
            </label>
            <div className="auth-contact">
              <span className="auth-contact-label">{t('auth.forgotContact')}</span>
              <div className="auth-contact-tabs" role="tablist" aria-label={t('auth.forgotContact')}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={contactChannel === 'email'}
                  className={`auth-contact-tab${contactChannel === 'email' ? ' auth-contact-tab--active' : ''}`}
                  onClick={() => {
                    setContactChannel('email');
                    setContactValue('');
                    setErrorCode(null);
                  }}
                  disabled={busy}
                >
                  {t('auth.forgotContactEmail')}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={contactChannel === 'x'}
                  className={`auth-contact-tab${contactChannel === 'x' ? ' auth-contact-tab--active' : ''}`}
                  onClick={() => {
                    setContactChannel('x');
                    setContactValue('');
                    setErrorCode(null);
                  }}
                  disabled={busy}
                >
                  {t('auth.forgotContactX')}
                </button>
              </div>
              <label className="auth-field">
                <span className="auth-sr-only">
                  {contactChannel === 'x' ? t('auth.forgotContactX') : t('auth.forgotContactEmail')}
                </span>
                <input
                  type={contactChannel === 'email' ? 'email' : 'text'}
                  autoComplete={contactChannel === 'email' ? 'email' : 'off'}
                  autoCapitalize="none"
                  spellCheck={false}
                  value={contactValue}
                  onChange={(e) => setContactValue(e.target.value)}
                  placeholder={
                    contactChannel === 'x'
                      ? t('auth.forgotContactXPlaceholder')
                      : t('auth.forgotContactEmailPlaceholder')
                  }
                  required
                />
              </label>
              <p className="auth-contact-hint">{t('auth.forgotContactHint')}</p>
            </div>
          </>
        )}
        {errorCode && <p className="auth-modal-error">{t(errorKey(errorCode))}</p>}
        <button type="submit" className="auth-btn auth-btn--primary" disabled={busy}>
          {busy
            ? t('auth.processing')
            : forgotQuestionId
              ? t('auth.forgotSubmit')
              : t('auth.forgotContinue')}
        </button>
        <button
          type="button"
          className="auth-link-btn"
          onClick={() => switchMode('login')}
          disabled={busy}
        >
          {t('auth.backToLogin')}
        </button>
      </form>
    </>
  ) : (
    <>
      <div className="auth-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'login'}
          className={`auth-tab${mode === 'login' ? ' auth-tab--active' : ''}`}
          onClick={() => switchMode('login')}
        >
          {t('auth.login')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'register'}
          className={`auth-tab${mode === 'register' ? ' auth-tab--active' : ''}`}
          onClick={() => switchMode('register')}
        >
          {t('auth.register')}
        </button>
      </div>

      <form className="auth-modal-body" onSubmit={handleSubmit} noValidate>
        <label className="auth-field">
          <span>{t('auth.username')}</span>
          <input
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={t('auth.usernamePlaceholder')}
            required
            autoFocus
          />
        </label>

        <label className="auth-field">
          <span>{t('auth.password')}</span>
          <input
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
        </label>

        {mode === 'register' && (
          <>
            <label className="auth-field">
              <span>{t('auth.passwordConfirm')}</span>
              <input
                type="password"
                autoComplete="new-password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                minLength={8}
                required
              />
            </label>
            <label className="auth-field">
              <span>{t('auth.securityQuestion')}</span>
              <select
                className="auth-select"
                value={securityQuestionId}
                onChange={(e) => setSecurityQuestionId(e.target.value)}
                required
              >
                {SECURITY_QUESTIONS.map((q) => (
                  <option key={q.id} value={q.id}>
                    {t(q.labelKey)}
                  </option>
                ))}
              </select>
            </label>
            <label className="auth-field">
              <span>{t('auth.securityAnswer')}</span>
              <input
                type="text"
                autoComplete="off"
                value={securityAnswer}
                onChange={(e) => setSecurityAnswer(e.target.value)}
                placeholder={t('auth.securityAnswerPlaceholder')}
                required
                minLength={1}
              />
            </label>
            <p className="auth-modal-hint">{t('auth.securityHint')}</p>
          </>
        )}

        {errorCode && <p className="auth-modal-error">{t(errorKey(errorCode))}</p>}

        <button type="submit" className="auth-btn auth-btn--primary" disabled={busy}>
          {busy ? t('auth.processing') : mode === 'login' ? t('auth.login') : t('auth.register')}
        </button>
        {mode === 'login' && (
          <button
            type="button"
            className="auth-link-btn"
            onClick={() => switchMode('forgot')}
            disabled={busy}
          >
            {t('auth.forgotPassword')}
          </button>
        )}
      </form>
    </>
  );

  return createPortal(
    <div
      className="auth-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !mustChange) onClose?.();
      }}
    >
      <div className="auth-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="auth-modal-header">
          <h2>{mustChange ? t('auth.changePassword') : t('auth.account')}</h2>
          {!mustChange && (
            <button type="button" className="auth-modal-close" onClick={onClose} title={t('auth.close')}>
              ×
            </button>
          )}
        </div>
        {content}
      </div>
    </div>,
    document.body
  );
};

export default AuthModal;
