import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './Toast.css';

/**
 * Hafif bildirim (toast) sistemi.
 *   const { notify } = useToast();
 *   notify('Kaydedildi');                                   // info
 *   notify({ kind: 'success', text: 'Hesap oluşturuldu' }); // success | error | info | warning
 *   notify({ kind: 'error', text: '...', duration: 8000 }); // ms; 0 → kalıcı (tıklayınca kapanır)
 *
 * - En fazla 4 bildirim üst üste; aynı metin 1.5 sn içinde tekrar gelirse yutulur.
 * - Metinler çağıran tarafta çevrilir (t ile), burada yalnızca gösterilir.
 */
const ToastContext = createContext(null);

const MAX_TOASTS = 4;
const DEDUPE_MS = 1500;
const DEFAULT_DURATION = { success: 3500, info: 3500, warning: 5000, error: 6000 };
const ICONS = { success: '✓', info: 'ℹ', warning: '⚠', error: '✕' };

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const seqRef = useRef(0);
  const timersRef = useRef(new Map());
  const lastRef = useRef({ text: null, at: 0 });

  const dismiss = useCallback((id) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback(
    (input) => {
      const toast = typeof input === 'string' ? { text: input } : input || {};
      const text = String(toast.text || '').trim();
      if (!text) return null;

      const now = Date.now();
      if (lastRef.current.text === text && now - lastRef.current.at < DEDUPE_MS) return null;
      lastRef.current = { text, at: now };

      const kind = DEFAULT_DURATION[toast.kind] ? toast.kind : 'info';
      const duration = toast.duration === undefined ? DEFAULT_DURATION[kind] : toast.duration;
      seqRef.current += 1;
      const id = seqRef.current;

      setToasts((prev) => {
        const next = [...prev, { id, kind, text, title: toast.title || null }];
        // Taşanları (en eskileri) düşür ve zamanlayıcılarını temizle
        while (next.length > MAX_TOASTS) {
          const dropped = next.shift();
          const timer = timersRef.current.get(dropped.id);
          if (timer) {
            clearTimeout(timer);
            timersRef.current.delete(dropped.id);
          }
        }
        return next;
      });

      if (duration > 0) {
        timersRef.current.set(id, setTimeout(() => dismiss(id), duration));
      }
      return id;
    },
    [dismiss]
  );

  // Unmount → tüm zamanlayıcıları temizle
  useEffect(
    () => () => {
      timersRef.current.forEach((timer) => clearTimeout(timer));
      timersRef.current.clear();
    },
    []
  );

  const value = useMemo(() => ({ notify, dismiss }), [notify, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {typeof document !== 'undefined' &&
        createPortal(
          <div className="toast-viewport" role="region" aria-label="Bildirimler">
            {toasts.map((toast) => (
              <div
                key={toast.id}
                className={`toast toast--${toast.kind}`}
                role={toast.kind === 'error' ? 'alert' : 'status'}
                aria-live={toast.kind === 'error' ? 'assertive' : 'polite'}
                onClick={() => dismiss(toast.id)}
              >
                <span className="toast-icon" aria-hidden="true">
                  {ICONS[toast.kind]}
                </span>
                <div className="toast-body">
                  {toast.title && <strong className="toast-title">{toast.title}</strong>}
                  <span className="toast-text">{toast.text}</span>
                </div>
                <button
                  type="button"
                  className="toast-close"
                  aria-label="Kapat"
                  onClick={(e) => {
                    e.stopPropagation();
                    dismiss(toast.id);
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>,
          document.body
        )}
    </ToastContext.Provider>
  );
}

const NOOP = { notify: () => null, dismiss: () => {} };

/** Provider yoksa (testler vb.) sessiz no-op döner */
export function useToast() {
  return useContext(ToastContext) || NOOP;
}
