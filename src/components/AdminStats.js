import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../utils/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { getTranslation } from '../utils/translations';
import './AdminStats.css';

const fill = (text, params) =>
  Object.entries(params || {}).reduce((acc, [k, v]) => acc.replace(`{${k}}`, v), text);

const formatTime = (value, language) => {
  if (!value) return '';
  try {
    const locale = language === 'kr' ? 'ko' : language === 'en' ? 'en' : 'tr';
    return new Date(value).toLocaleString(locale, {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(value);
  }
};

const AdminStatsModal = ({ open, onClose }) => {
  const { language } = useLanguage();
  const t = (key, params) => fill(getTranslation(key, language), params);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const next = await api('/api/admin/stats');
      setData(next);
      setError(null);
    } catch (err) {
      if (err?.status === 403 || err?.status === 404) {
        setError('hidden');
      } else {
        setError('generic');
      }
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    load();
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, load, onClose]);

  if (!open || error === 'hidden') return null;

  const online = data?.online || { total: 0, users: 0, guests: 0 };
  const logins = data?.logins || { today: 0, week: 0 };
  const rows = Array.isArray(data?.recentLogins) ? data.recentLogins : [];

  return createPortal(
    <div
      className="admin-stats-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        className="admin-stats-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-stats-heading"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="admin-stats-modal-header">
          <h2 id="admin-stats-heading">{t('stats.title')}</h2>
          <div className="admin-stats-modal-header-actions">
            <button
              type="button"
              className="admin-stats-refresh"
              onClick={load}
              disabled={busy}
              title={t('stats.refresh')}
            >
              {busy ? '…' : '↻'}
            </button>
            <button
              type="button"
              className="admin-stats-close"
              onClick={onClose}
              title={t('auth.close')}
            >
              ×
            </button>
          </div>
        </div>

        <div className="admin-stats-modal-body">
          {error && <p className="admin-stats-error">{t('stats.error')}</p>}

          <div className="admin-stats-online">
            <span className="admin-stats-online-dot" aria-hidden="true" />
            <span className="admin-stats-online-label">{t('stats.online')}</span>
            <strong>{online.total}</strong>
            <span className="admin-stats-online-split">
              {t('stats.onlineSplit', { users: online.users, guests: online.guests })}
            </span>
          </div>

          <div className="admin-stats-grid">
            <div className="admin-stats-cell">
              <span className="admin-stats-num">{logins.today}</span>
              <span className="admin-stats-label">{t('stats.loginsToday')}</span>
            </div>
            <div className="admin-stats-cell">
              <span className="admin-stats-num">{logins.week}</span>
              <span className="admin-stats-label">{t('stats.loginsWeek')}</span>
            </div>
          </div>

          <p className="admin-stats-subtitle">{t('stats.recentLogins')}</p>
          {rows.length === 0 ? (
            <p className="admin-stats-empty">{t('stats.emptyLogins')}</p>
          ) : (
            <ul className="admin-stats-recent">
              {rows.map((row, i) => (
                <li key={`${row.username}-${row.at}-${i}`}>
                  <span>
                    @{row.username}
                    {row.kind === 'register' ? ` · ${t('stats.event.register')}` : ''}
                  </span>
                  <span>{formatTime(row.at, language)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default AdminStatsModal;
