import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../utils/apiClient';

const POLL_MS = 30 * 1000;

const EVENT_KEYS = {
  login: 'stats.event.login',
  register: 'stats.event.register',
  binder_created: 'stats.event.binderCreated',
  binder_saved: 'stats.event.binderSaved',
  binder_exported: 'stats.event.binderExported',
  binder_imported: 'stats.event.binderImported',
  share_sent: 'stats.event.shareSent',
  zip_download: 'stats.event.zipDownload',
  image_download: 'stats.event.imageDownload',
};

const formatBytes = (bytes) => {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

const formatTime = (value, language) => {
  if (!value) return '';
  try {
    const locale = language === 'kr' ? 'ko' : language === 'en' ? 'en' : 'tr';
    return new Date(value).toLocaleString(locale, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(value);
  }
};

/**
 * Yalnızca user.isAdmin (sunucu ADMIN_USERNAMES) iken render edilir.
 * 403/404 olursa panel gizlenir — normal kullanıcıya bir şey görünmez.
 */
const AdminStats = ({ t, language }) => {
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
        setError(err?.code === 'NETWORK_ERROR' ? 'network' : 'generic');
      }
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  if (error === 'hidden') return null;

  const online = data?.online || { total: 0, users: 0, guests: 0 };
  const users = data?.users || { total: 0, today: 0, week: 0 };
  const logins = data?.logins || { today: 0, week: 0 };
  const visits = data?.visits || { today: 0, visitorsToday: 0, week: 0, visitorsWeek: 0 };
  const binders = data?.binders || { total: 0, memberships: 0, updated_week: 0 };
  const images = data?.images || { count: 0, bytes: 0 };

  return (
    <section className="admin-stats" aria-label={t('stats.title')}>
      <div className="admin-stats-header">
        <p className="admin-stats-title">{t('stats.title')}</p>
        <button
          type="button"
          className="admin-stats-refresh"
          onClick={load}
          disabled={busy}
          title={t('stats.refresh')}
        >
          {busy ? '…' : '↻'}
        </button>
      </div>

      {error && error !== 'hidden' && (
        <p className="admin-stats-error">{t('stats.error')}</p>
      )}

      <div className="admin-stats-online">
        <span className="admin-stats-online-dot" aria-hidden="true" />
        <strong>{online.total}</strong>
        <span>{t('stats.online')}</span>
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
        <div className="admin-stats-cell">
          <span className="admin-stats-num">{visits.visitorsToday}</span>
          <span className="admin-stats-label">{t('stats.visitorsToday')}</span>
        </div>
        <div className="admin-stats-cell">
          <span className="admin-stats-num">{visits.visitorsWeek}</span>
          <span className="admin-stats-label">{t('stats.visitorsWeek')}</span>
        </div>
        <div className="admin-stats-cell">
          <span className="admin-stats-num">{users.total}</span>
          <span className="admin-stats-label">{t('stats.usersTotal')}</span>
        </div>
        <div className="admin-stats-cell">
          <span className="admin-stats-num">{users.today}</span>
          <span className="admin-stats-label">{t('stats.usersToday')}</span>
        </div>
        <div className="admin-stats-cell">
          <span className="admin-stats-num">{binders.total}</span>
          <span className="admin-stats-label">{t('stats.binders')}</span>
        </div>
        <div className="admin-stats-cell">
          <span className="admin-stats-num">{images.count}</span>
          <span className="admin-stats-label">{t('stats.images', { size: formatBytes(images.bytes) })}</span>
        </div>
      </div>

      {Array.isArray(data?.events) && data.events.length > 0 && (
        <ul className="admin-stats-events">
          {data.events.map((row) => (
            <li key={row.name}>
              <span>{t(EVENT_KEYS[row.name] || 'stats.event.other', { name: row.name })}</span>
              <span>
                {row.today}/{row.week}
              </span>
            </li>
          ))}
        </ul>
      )}

      {Array.isArray(data?.recentLogins) && data.recentLogins.length > 0 && (
        <>
          <p className="admin-stats-subtitle">{t('stats.recentLogins')}</p>
          <ul className="admin-stats-recent">
            {data.recentLogins.map((row, i) => (
              <li key={`${row.username}-${row.at}-${i}`}>
                <span>@{row.username}</span>
                <span>{formatTime(row.at, language)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
};

export default AdminStats;
