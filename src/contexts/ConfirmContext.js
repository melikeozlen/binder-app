import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './Confirm.css';

/**
 * Web / mobil uyumlu onay penceresi.
 *   const { confirm } = useConfirm();
 *   const ok = await confirm({
 *     title: 'Silinsin mi?',
 *     message: '...',
 *     confirmLabel: 'Sil',
 *     cancelLabel: 'İptal',
 *     danger: true,
 *   });
 */
const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const resolverRef = useRef(null);

  const close = useCallback((result) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setDialog(null);
    if (resolve) resolve(Boolean(result));
  }, []);

  useEffect(() => {
    if (!dialog) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [dialog, close]);

  const confirm = useCallback((options = {}) => {
    const opts = typeof options === 'string' ? { message: options } : options;
    return new Promise((resolve) => {
      // Önceki bekleyen diyalog varsa reddet
      if (resolverRef.current) resolverRef.current(false);
      resolverRef.current = resolve;
      setDialog({
        title: opts.title || null,
        message: String(opts.message || '').trim(),
        confirmLabel: opts.confirmLabel || 'OK',
        cancelLabel: opts.cancelLabel || 'Cancel',
        danger: Boolean(opts.danger),
      });
    });
  }, []);

  const value = useMemo(() => ({ confirm }), [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {typeof document !== 'undefined' &&
        dialog &&
        createPortal(
          <div
            className="confirm-overlay"
            role="presentation"
            onClick={(e) => {
              if (e.target === e.currentTarget) close(false);
            }}
          >
            <div
              className={`confirm-dialog${dialog.danger ? ' confirm-dialog--danger' : ''}`}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby={dialog.title ? 'confirm-dialog-title' : undefined}
              aria-describedby="confirm-dialog-message"
              onClick={(e) => e.stopPropagation()}
            >
              {dialog.title && (
                <h2 id="confirm-dialog-title" className="confirm-dialog-title">
                  {dialog.title}
                </h2>
              )}
              <p id="confirm-dialog-message" className="confirm-dialog-message">
                {dialog.message}
              </p>
              <div className="confirm-dialog-actions">
                <button
                  type="button"
                  className="confirm-btn confirm-btn--cancel"
                  onClick={() => close(false)}
                >
                  {dialog.cancelLabel}
                </button>
                <button
                  type="button"
                  className={`confirm-btn confirm-btn--ok${dialog.danger ? ' confirm-btn--danger' : ''}`}
                  onClick={() => close(true)}
                  autoFocus
                >
                  {dialog.confirmLabel}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </ConfirmContext.Provider>
  );
}

const NOOP = {
  confirm: async () => false,
};

export function useConfirm() {
  return useContext(ConfirmContext) || NOOP;
}
