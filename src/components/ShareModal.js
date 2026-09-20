import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import './AuthModal.css';
import { useLanguage } from '../contexts/LanguageContext';
import { getTranslation } from '../utils/translations';
import { shareErrorKey } from '../utils/shareErrors';

const USERNAME_RE = /^[A-Za-z0-9_.]{3,32}$/;

const fill = (text, params) =>
  Object.entries(params || {}).reduce((acc, [k, v]) => acc.replace(`{${k}}`, v), text);

/**
 * Binder paylaşım penceresi — kullanıcı adı girişi (login popup stili).
 */
const ShareModal = ({ open, binderName, onClose, onSend }) => {
  const { language } = useLanguage();
  const t = (key, params) => fill(getTranslation(key, language), params);

  const [username, setUsername] = useState('');
  const [role, setRole] = useState('edit'); // 'edit' | 'view'
  const [errorText, setErrorText] = useState(null);
  const [successText, setSuccessText] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    setUsername('');
    setRole('edit');
    setErrorText(null);
    setSuccessText(null);
    setBusy(false);
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && !busy) onClose?.();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose, busy]);

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (busy || successText) return;
    setErrorText(null);

    const trimmed = username.trim();
    if (!USERNAME_RE.test(trimmed)) {
      setErrorText(t(shareErrorKey('INVALID_USERNAME')));
      return;
    }

    setBusy(true);
    try {
      await onSend?.(trimmed, role);
      setSuccessText(
        t(role === 'view' ? 'share.sentView' : 'share.sentEdit', { username: trimmed })
      );
    } catch (error) {
      setErrorText(t(shareErrorKey(error?.code)));
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div
      className="auth-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose?.();
      }}
    >
      <div className="auth-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="auth-modal-header">
          <h2>{t('share.modalTitle')}</h2>
          <button
            type="button"
            className="auth-modal-close"
            onClick={onClose}
            disabled={busy}
            title={t('auth.close')}
          >
            ×
          </button>
        </div>

        {successText ? (
          <div className="auth-modal-body">
            <p className="auth-modal-ok">{successText}</p>
            <button type="button" className="auth-btn auth-btn--primary" onClick={onClose}>
              {t('share.done')}
            </button>
          </div>
        ) : (
          <form className="auth-modal-body" onSubmit={handleSubmit} noValidate>
            {binderName && (
              <p className="auth-modal-hint">
                {t('share.modalHint', { name: binderName })}
              </p>
            )}

            <label className="auth-field">
              <span>{t('share.toUsername')}</span>
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
                disabled={busy}
              />
            </label>

            <fieldset className="share-role" disabled={busy}>
              <legend>{t('share.roleLabel')}</legend>
              <label className={`share-role-option${role === 'edit' ? ' share-role-option--active' : ''}`}>
                <input
                  type="radio"
                  name="share-role"
                  value="edit"
                  checked={role === 'edit'}
                  onChange={() => setRole('edit')}
                />
                <span className="share-role-title">✏️ {t('share.roleEdit')}</span>
                <span className="share-role-desc">{t('share.roleEditDesc')}</span>
              </label>
              <label className={`share-role-option${role === 'view' ? ' share-role-option--active' : ''}`}>
                <input
                  type="radio"
                  name="share-role"
                  value="view"
                  checked={role === 'view'}
                  onChange={() => setRole('view')}
                />
                <span className="share-role-title">👁 {t('share.roleView')}</span>
                <span className="share-role-desc">{t('share.roleViewDesc')}</span>
              </label>
            </fieldset>

            {errorText && <p className="auth-modal-error">{errorText}</p>}

            <div className="auth-modal-actions">
              <button
                type="button"
                className="auth-btn auth-btn--secondary"
                onClick={onClose}
                disabled={busy}
              >
                {t('binder.cancel')}
              </button>
              <button type="submit" className="auth-btn auth-btn--primary" disabled={busy}>
                {busy ? t('auth.processing') : t('share.send')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
};

export default ShareModal;
