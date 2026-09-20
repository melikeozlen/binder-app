import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import './AuthModal.css';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getTranslation } from '../utils/translations';

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

/**
 * Hesap penceresi.
 * - Çıkış yapılmışsa: "Giriş Yap" / "Hesap Oluştur" sekmeleri (kullanıcı adı + şifre)
 * - Giriş yapılmışsa: kullanıcı adı, eşitleme durumu, "Şimdi eşitle", "Çıkış"
 */
const AuthModal = ({ open, onClose, syncStatus = 'idle', onSyncNow }) => {
  const { user, login, register, logout } = useAuth();
  const { language } = useLanguage();
  const t = (key) => getTranslation(key, language);

  const [mode, setMode] = useState('login'); // login | register
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [errorCode, setErrorCode] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    setErrorCode(null);
    setBusy(false);
    setPassword('');
    setPasswordConfirm('');
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
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
      } else {
        await register(trimmedUsername, password);
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
      <div className="auth-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
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
