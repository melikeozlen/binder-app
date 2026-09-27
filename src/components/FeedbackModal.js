import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, ApiError } from '../utils/apiClient';
import { getClientId } from '../utils/clientId';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useToast } from '../contexts/ToastContext';
import { getTranslation } from '../utils/translations';
import { useModalA11y } from '../hooks/useModalA11y';
import './FeedbackModal.css';

const MAX_LEN = 2000;

const FeedbackModal = ({ open, onClose }) => {
  const { language } = useLanguage();
  const { user } = useAuth();
  const { notify } = useToast();
  const dialogRef = useRef(null);
  const textareaRef = useRef(null);
  const t = (key, params) => {
    let text = getTranslation(key, language);
    if (params) {
      Object.keys(params).forEach((param) => {
        text = text.replace(`{${param}}`, params[param]);
      });
    }
    return text;
  };

  const [message, setMessage] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [sending, setSending] = useState(false);

  useModalA11y({
    open,
    onClose,
    containerRef: dialogRef,
    initialFocusRef: textareaRef,
  });

  useEffect(() => {
    if (!open) return undefined;
    setMessage('');
    setAnonymous(false);
    setSending(false);
    return undefined;
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = message.trim();
    if (trimmed.length < 3) {
      notify({ kind: 'warning', text: t('feedback.tooShort') });
      return;
    }
    setSending(true);
    try {
      await api('/api/feedback', {
        method: 'POST',
        body: {
          message: trimmed,
          anonymous: Boolean(user) && anonymous,
          clientId: getClientId(),
        },
      });
      notify({ kind: 'success', text: t('feedback.success') });
      onClose?.();
    } catch (error) {
      const code = error instanceof ApiError ? error.code : null;
      notify({
        kind: 'error',
        text: code === 'RATE_LIMITED' ? t('feedback.rateLimited') : t('feedback.failed'),
      });
    } finally {
      setSending(false);
    }
  };

  return createPortal(
    <div
      className="feedback-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        ref={dialogRef}
        className="feedback-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="feedback-modal-header">
          <h2 id="feedback-modal-title">{t('feedback.title')}</h2>
          <button
            type="button"
            className="feedback-modal-close"
            onClick={onClose}
            aria-label={t('feedback.close')}
          >
            ×
          </button>
        </div>
        <form className="feedback-modal-body" onSubmit={handleSubmit}>
          <p className="feedback-modal-hint">{t('feedback.hint')}</p>
          <label className="feedback-label" htmlFor="feedback-message">
            {t('feedback.message')}
          </label>
          <textarea
            ref={textareaRef}
            id="feedback-message"
            className="feedback-textarea"
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, MAX_LEN))}
            placeholder={t('feedback.placeholder')}
            rows={5}
            maxLength={MAX_LEN}
            disabled={sending}
          />
          <div className="feedback-meta">
            <span className="feedback-char-count">
              {message.length}/{MAX_LEN}
            </span>
            {user ? (
              <label className="feedback-anon-label">
                <input
                  type="checkbox"
                  checked={anonymous}
                  onChange={(e) => setAnonymous(e.target.checked)}
                  disabled={sending}
                />
                {t('feedback.sendAnonymous')}
              </label>
            ) : (
              <span className="feedback-guest-note">{t('feedback.guestNote')}</span>
            )}
          </div>
          {user && !anonymous && (
            <p className="feedback-as-user">{t('feedback.asUser', { username: user.username })}</p>
          )}
          <div className="feedback-actions">
            <button type="button" className="feedback-cancel" onClick={onClose} disabled={sending}>
              {t('feedback.cancel')}
            </button>
            <button type="submit" className="feedback-submit" disabled={sending || message.trim().length < 3}>
              {sending ? t('feedback.sending') : t('feedback.send')}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

export default FeedbackModal;
