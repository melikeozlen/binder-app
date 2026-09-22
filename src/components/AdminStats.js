import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../utils/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { getTranslation } from '../utils/translations';
import './AdminStats.css';

const fill = (text, params) =>
  Object.entries(params || {}).reduce((acc, [k, v]) => acc.replace(`{${k}}`, String(v)), text);

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

const formatRelative = (value, t) => {
  if (!value) return '';
  const diff = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diff) || diff < 0) return '';
  if (diff < 45_000) return t('stats.justNow');
  if (diff < 3_600_000) return t('stats.minutesAgo', { n: Math.max(1, Math.floor(diff / 60_000)) });
  if (diff < 86_400_000) return t('stats.hoursAgo', { n: Math.max(1, Math.floor(diff / 3_600_000)) });
  return t('stats.daysAgo', { n: Math.max(1, Math.floor(diff / 86_400_000)) });
};

const actionLabel = (name, t) => {
  const key = `stats.event.${name}`;
  const translated = t(key);
  return translated === key ? name : translated;
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

  const online = data?.online || { total: 0, users: 0, guests: 0, people: [] };
  const people = Array.isArray(online.people) ? online.people : [];
  const logins = data?.logins || { today: 0, week: 0 };
  const activity = Array.isArray(data?.activity) ? data.activity : [];
  const loginRows = Array.isArray(data?.recentLogins) ? data.recentLogins : [];

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

          <p className="admin-stats-subtitle">{t('stats.onlinePeople')}</p>
          {people.length === 0 ? (
            <p className="admin-stats-empty">{t('stats.emptyOnline')}</p>
          ) : (
            <ul className="admin-stats-people">
              {people.map((p, i) => (
                <li key={`${p.kind}-${p.username || p.clientId}-${i}`}>
                  <div className="admin-stats-people-main">
                    <span className="admin-stats-people-name">
                      {p.kind === 'user'
                        ? `@${p.username || '?'}`
                        : t('stats.guestLabel', { id: p.clientId || '????' })}
                    </span>
                    <span className="admin-stats-people-action">
                      {actionLabel(p.lastAction || 'online', t)}
                    </span>
                  </div>
                  <div className="admin-stats-people-meta">
                    <span title={formatTime(p.lastSeen, language)}>
                      {t('stats.lastSeen')}: {formatRelative(p.lastSeen, t)}
                    </span>
                    <span title={formatTime(p.firstSeen, language)}>
                      {t('stats.since')}: {formatRelative(p.firstSeen, t)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}

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

          <p className="admin-stats-subtitle">{t('stats.recentActivity')}</p>
          {activity.length === 0 ? (
            <p className="admin-stats-empty">{t('stats.emptyActivity')}</p>
          ) : (
            <ul className="admin-stats-recent">
              {activity.map((row, i) => (
                <li key={`${row.name}-${row.at}-${i}`}>
                  <span>
                    {row.username
                      ? `@${row.username}`
                      : t('stats.guestLabel', { id: row.guestId || '????' })}
                    {' · '}
                    {actionLabel(row.name, t)}
                  </span>
                  <span>{formatTime(row.at, language)}</span>
                </li>
              ))}
            </ul>
          )}

          <p className="admin-stats-subtitle">{t('stats.recentLogins')}</p>
          {loginRows.length === 0 ? (
            <p className="admin-stats-empty">{t('stats.emptyLogins')}</p>
          ) : (
            <ul className="admin-stats-recent">
              {loginRows.map((row, i) => (
                <li key={`login-${row.username}-${row.at}-${i}`}>
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
