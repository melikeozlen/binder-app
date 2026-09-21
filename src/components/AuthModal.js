import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import './AuthModal.css';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getTranslation } from '../utils/translations';
import { shareErrorKey } from '../utils/shareErrors';
import AdminStats from './AdminStats';

const KNOWN_ERROR_CODES = new Set([
  'INVALID_CREDENTIALS',
  'USERNAME_EXISTS',
  'INVALID_USERNAME',
  'WEAK_PASSWORD',
  'PASSWORD_MISMATCH',
  'RATE_LIMITED',
  'NETWORK_ERROR',
]);

const USERNAME_RE = /^[A-Za-z0-9_.]{3,32}$/;

const errorKey = (code) => `auth.error.${KNOWN_ERROR_CODES.has(code) ? code : 'GENERIC'}`;

const fill = (text, params) =>
  Object.entries(params || {}).reduce((acc, [k, v]) => acc.replace(`{${k}}`, v), text);

/**
 * Hesap penceresi.
 * - Çıkış yapılmışsa: "Giriş Yap" / "Hesap Oluştur" sekmeleri (kullanıcı adı + şifre)
 * - Giriş yapılmışsa: kullanıcı adı, eşitleme durumu, paylaşımlar, "Şimdi eşitle", "Çıkış"
 */
const AuthModal = ({ open, onClose, syncStatus = 'idle', onSyncNow, shares }) => {
  const { user, login, register, logout } = useAuth();
  const { notify } = useToast();
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

  const [mode, setMode] = useState('login'); // login | register
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [errorCode, setErrorCode] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    setErrorCode(null);
    setShareMessage(null);
    setBusy(false);
    setPassword('');
    setPasswordConfirm('');
    shares?.refresh?.();
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
    // shares.refresh stabil; yalnızca açılışta çağrılmak istenir
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose]);

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

    setBusy(true);
    try {
      if (mode === 'login') {
        await login(trimmedUsername, password);
        notify({ kind: 'success', text: t('notify.loggedIn', { username: trimmedUsername }) });
      } else {
        await register(trimmedUsername, password);
        notify({ kind: 'success', text: t('notify.registered', { username: trimmedUsername }) });
      }
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

  const switchMode = (nextMode) => {
    if (nextMode === mode) return;
    setMode(nextMode);
    setErrorCode(null);
    setPasswordConfirm('');
  };

  const content = user ? (
    <div className="auth-modal-body">
      <p className="auth-modal-user">
        <span className="auth-modal-label">{t('auth.loggedInAs')}</span>
        <strong>{user.username}</strong>
      </p>
      <p className={`auth-modal-status auth-modal-status--${syncStatus}`}>
        {t(`auth.status.${syncStatus}`)}
      </p>
      <p className="auth-modal-hint">{t('auth.cloudInfo')}</p>

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
                          onClick={() => {
                            if (!window.confirm(t('share.removeConfirm', { username: m.username }))) return;
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
                          onClick={() => {
                            if (!window.confirm(t('binder.leaveSharedConfirm'))) return;
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

      {user.isAdmin && <AdminStats t={t} language={language} />}

      {errorCode && <p className="auth-modal-error">{t(errorKey(errorCode))}</p>}
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
    </div>
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
        <p className="auth-modal-hint">{t('auth.cloudInfo')}</p>

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
        )}

        {errorCode && <p className="auth-modal-error">{t(errorKey(errorCode))}</p>}

        <button type="submit" className="auth-btn auth-btn--primary" disabled={busy}>
          {busy ? t('auth.processing') : mode === 'login' ? t('auth.login') : t('auth.register')}
        </button>
      </form>
    </>
  );

  return createPortal(
    <div
      className="auth-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        className={`auth-modal${user?.isAdmin ? ' auth-modal--admin' : ''}`}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="auth-modal-header">
          <h2>{t('auth.account')}</h2>
          <button type="button" className="auth-modal-close" onClick={onClose} title={t('auth.close')}>
            ×
          </button>
        </div>
        {content}
      </div>
    </div>,
    document.body
  );
};

export default AuthModal;
