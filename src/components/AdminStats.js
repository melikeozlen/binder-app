import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../utils/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { useConfirm } from '../contexts/ConfirmContext';
import { useToast } from '../contexts/ToastContext';
import { getTranslation } from '../utils/translations';
import { useModalA11y } from '../hooks/useModalA11y';
import './AdminStats.css';

const TABS = ['overview', 'online', 'activity', 'accounts', 'feedback'];
const AUTO_REFRESH_MS = 20_000;

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

const matchesQuery = (haystack, query) => {
  if (!query) return true;
  return String(haystack || '').toLowerCase().includes(query);
};

const AdminStatsModal = ({ open, onClose }) => {
  const { language } = useLanguage();
  const { confirm } = useConfirm();
  const { notify } = useToast();
  const t = (key, params) => fill(getTranslation(key, language), params);
  const dialogRef = useRef(null);
  const [data, setData] = useState(null);
  const [feedback, setFeedback] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('overview');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [query, setQuery] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);

  useModalA11y({ open, onClose, containerRef: dialogRef });

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [next, fb] = await Promise.all([
        api('/api/admin/stats'),
        api('/api/feedback').catch(() => ({ items: [] })),
      ]);
      setData(next);
      setFeedback(Array.isArray(fb?.items) ? fb.items : []);
      setUpdatedAt(next?.generatedAt || new Date().toISOString());
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
    setTab('overview');
    setQuery('');
    load();
    return undefined;
  }, [open, load]);

  useEffect(() => {
    if (!open || !autoRefresh) return undefined;
    const id = window.setInterval(() => {
      load();
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [open, autoRefresh, load]);

  const online = data?.online || { total: 0, users: 0, guests: 0, people: [] };
  const people = Array.isArray(online.people) ? online.people : [];
  const logins = data?.logins || { today: 0, week: 0 };
  const summary = data?.summary || {};
  const activity = Array.isArray(data?.activity) ? data.activity : [];
  const loginRows = Array.isArray(data?.recentLogins) ? data.recentLogins : [];

  const q = query.trim().toLowerCase();

  const filteredPeople = useMemo(
    () =>
      people.filter((p) =>
        matchesQuery(
          `${p.username || ''} ${p.clientId || ''} ${p.lastAction || ''}`,
          q
        )
      ),
    [people, q]
  );

  const filteredActivity = useMemo(
    () =>
      activity.filter((row) =>
        matchesQuery(`${row.username || ''} ${row.guestId || ''} ${row.name || ''}`, q)
      ),
    [activity, q]
  );

  const filteredLogins = useMemo(
    () => loginRows.filter((row) => matchesQuery(`${row.username || ''} ${row.kind || ''}`, q)),
    [loginRows, q]
  );

  const filteredFeedback = useMemo(
    () =>
      feedback.filter((item) =>
        matchesQuery(`${item.username || ''} ${item.message || ''}`, q)
      ),
    [feedback, q]
  );

  const copyFeedback = async (item) => {
    try {
      await navigator.clipboard.writeText(item.message || '');
      setCopiedId(item.id);
      window.setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // ignore
    }
  };

  const deleteFeedback = async (item) => {
    const raw = String(item.message || '').trim();
    const preview = raw.length > 15 ? `${raw.slice(0, 15)}…` : raw || '…';
    const ok = await confirm({
      title: t('dialog.title.deleteFeedback'),
      message: t('stats.deleteFeedbackConfirm', { preview }),
      confirmLabel: t('dialog.delete'),
      cancelLabel: t('dialog.cancel'),
      danger: true,
    });
    if (!ok) return;
    setDeletingId(item.id);
    try {
      await api(`/api/feedback/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
      setFeedback((prev) => prev.filter((f) => f.id !== item.id));
      setData((prev) => {
        if (!prev?.summary) return prev;
        const total = Math.max(0, (prev.summary.feedbackTotal || 0) - 1);
        return {
          ...prev,
          summary: { ...prev.summary, feedbackTotal: total },
        };
      });
    } catch (err) {
      notify({ kind: 'error', text: err?.message || t('stats.deleteFeedbackFailed') });
    } finally {
      setDeletingId(null);
    }
  };

  if (!open || error === 'hidden') return null;

  const showSearch = tab !== 'overview';

  return createPortal(
    <div
      className="admin-stats-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        ref={dialogRef}
        className="admin-stats-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-stats-heading"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="admin-stats-modal-header">
          <div className="admin-stats-modal-heading-wrap">
            <h2 id="admin-stats-heading">{t('stats.title')}</h2>
            {updatedAt && (
              <span className="admin-stats-updated" title={formatTime(updatedAt, language)}>
                {t('stats.updated', { time: formatRelative(updatedAt, t) })}
              </span>
            )}
          </div>
          <div className="admin-stats-modal-header-actions">
            <label className="admin-stats-auto" title={t('stats.autoRefreshHelp')}>
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
              <span>{t('stats.autoRefresh')}</span>
            </label>
            <button
              type="button"
              className="admin-stats-refresh"
              onClick={load}
              disabled={busy}
              title={t('stats.refresh')}
              aria-label={t('stats.refresh')}
            >
              {busy ? '…' : '↻'}
            </button>
            <button
              type="button"
              className="admin-stats-close"
              onClick={onClose}
              aria-label={t('auth.close')}
            >
              ×
            </button>
          </div>
        </div>

        <div className="admin-stats-tabs" role="tablist" aria-label={t('stats.title')}>
          {TABS.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={`admin-stats-tab${tab === id ? ' admin-stats-tab--active' : ''}`}
              onClick={() => setTab(id)}
            >
              {t(`stats.tab.${id}`)}
              {id === 'online' && online.total > 0 ? (
                <span className="admin-stats-tab-badge">{online.total}</span>
              ) : null}
              {id === 'feedback' && feedback.length > 0 ? (
                <span className="admin-stats-tab-badge">{feedback.length}</span>
              ) : null}
            </button>
          ))}
        </div>

        {showSearch && (
          <div className="admin-stats-toolbar">
            <input
              type="search"
              className="admin-stats-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('stats.searchPlaceholder')}
              aria-label={t('stats.searchPlaceholder')}
            />
          </div>
        )}

        <div className="admin-stats-modal-body">
          {error && <p className="admin-stats-error">{t('stats.error')}</p>}

          {tab === 'overview' && (
            <>
              <div className="admin-stats-online">
                <span className="admin-stats-online-dot" aria-hidden="true" />
                <span className="admin-stats-online-label">{t('stats.online')}</span>
                <strong>{online.total}</strong>
                <span className="admin-stats-online-split">
                  {t('stats.onlineSplit', { users: online.users, guests: online.guests })}
                </span>
              </div>

              <div className="admin-stats-grid admin-stats-grid--kpi">
                <div className="admin-stats-cell">
                  <span className="admin-stats-num">{logins.today}</span>
                  <span className="admin-stats-label">{t('stats.loginsToday')}</span>
                </div>
                <div className="admin-stats-cell">
                  <span className="admin-stats-num">{logins.week}</span>
                  <span className="admin-stats-label">{t('stats.loginsWeek')}</span>
                </div>
                <div className="admin-stats-cell">
                  <span className="admin-stats-num">{summary.registersToday || 0}</span>
                  <span className="admin-stats-label">{t('stats.registersToday')}</span>
                </div>
                <div className="admin-stats-cell">
                  <span className="admin-stats-num">{summary.registersWeek || 0}</span>
                  <span className="admin-stats-label">{t('stats.registersWeek')}</span>
                </div>
                <div className="admin-stats-cell">
                  <span className="admin-stats-num">{summary.visitsToday || 0}</span>
                  <span className="admin-stats-label">{t('stats.visitsToday')}</span>
                </div>
                <div className="admin-stats-cell">
                  <span className="admin-stats-num">{summary.visitsWeek || 0}</span>
                  <span className="admin-stats-label">{t('stats.visitsWeek')}</span>
                </div>
                <div className="admin-stats-cell">
                  <span className="admin-stats-num">{summary.savesToday || 0}</span>
                  <span className="admin-stats-label">{t('stats.savesToday')}</span>
                </div>
                <div className="admin-stats-cell">
                  <span className="admin-stats-num">{summary.savesWeek || 0}</span>
                  <span className="admin-stats-label">{t('stats.savesWeek')}</span>
                </div>
                <div className="admin-stats-cell">
                  <span className="admin-stats-num">{summary.sharesToday || 0}</span>
                  <span className="admin-stats-label">{t('stats.sharesToday')}</span>
                </div>
                <div className="admin-stats-cell">
                  <span className="admin-stats-num">{summary.activeUsersWeek || 0}</span>
                  <span className="admin-stats-label">{t('stats.activeUsersWeek')}</span>
                </div>
                <div className="admin-stats-cell">
                  <span className="admin-stats-num">{summary.feedbackToday || 0}</span>
                  <span className="admin-stats-label">{t('stats.feedbackToday')}</span>
                </div>
                <div className="admin-stats-cell">
                  <span className="admin-stats-num">{summary.feedbackTotal || 0}</span>
                  <span className="admin-stats-label">{t('stats.feedbackTotal')}</span>
                </div>
              </div>

              <div className="admin-stats-quick">
                <button type="button" className="admin-stats-quick-btn" onClick={() => setTab('online')}>
                  {t('stats.tab.online')} →
                </button>
                <button type="button" className="admin-stats-quick-btn" onClick={() => setTab('feedback')}>
                  {t('stats.tab.feedback')} →
                </button>
                <button type="button" className="admin-stats-quick-btn" onClick={() => setTab('activity')}>
                  {t('stats.tab.activity')} →
                </button>
              </div>
            </>
          )}

          {tab === 'online' && (
            <>
              <div className="admin-stats-online admin-stats-online--compact">
                <span className="admin-stats-online-dot" aria-hidden="true" />
                <strong>{online.total}</strong>
                <span className="admin-stats-online-split">
                  {t('stats.onlineSplit', { users: online.users, guests: online.guests })}
                </span>
              </div>
              {filteredPeople.length === 0 ? (
                <p className="admin-stats-empty">
                  {q ? t('stats.noSearchResults') : t('stats.emptyOnline')}
                </p>
              ) : (
                <ul className="admin-stats-people">
                  {filteredPeople.map((p, i) => (
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
            </>
          )}

          {tab === 'activity' &&
            (filteredActivity.length === 0 ? (
              <p className="admin-stats-empty">
                {q ? t('stats.noSearchResults') : t('stats.emptyActivity')}
              </p>
            ) : (
              <div className="admin-stats-scroll admin-stats-scroll--fill">
                <ul className="admin-stats-recent">
                  {filteredActivity.map((row, i) => (
                    <li key={`${row.name}-${row.at}-${i}`}>
                      <span>
                        {row.username
                          ? `@${row.username}`
                          : t('stats.guestLabel', { id: row.guestId || '????' })}
                        {' · '}
                        {actionLabel(row.name, t)}
                      </span>
                      <span className="admin-stats-recent-time">
                        {formatTime(row.at, language)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

          {tab === 'accounts' &&
            (filteredLogins.length === 0 ? (
              <p className="admin-stats-empty">
                {q ? t('stats.noSearchResults') : t('stats.emptyLogins')}
              </p>
            ) : (
              <div className="admin-stats-scroll admin-stats-scroll--fill">
                <ul className="admin-stats-recent">
                  {filteredLogins.map((row, i) => (
                    <li key={`login-${row.username}-${row.at}-${i}`}>
                      <span>
                        @{row.username}
                        {row.kind === 'register' ? ` · ${t('stats.event.register')}` : ` · ${t('stats.event.login')}`}
                      </span>
                      <span className="admin-stats-recent-time">
                        {formatTime(row.at, language)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

          {tab === 'feedback' &&
            (filteredFeedback.length === 0 ? (
              <p className="admin-stats-empty">
                {q ? t('stats.noSearchResults') : t('stats.emptyFeedback')}
              </p>
            ) : (
              <div className="admin-stats-scroll admin-stats-scroll--fill">
                <ul className="admin-stats-feedback">
                  {filteredFeedback.map((item) => (
                    <li key={item.id}>
                      <div className="admin-stats-feedback-meta">
                        <span>
                          {item.username
                            ? `@${item.username}`
                            : t('stats.feedbackAnonymous')}
                        </span>
                        <span className="admin-stats-feedback-meta-right">
                          <span className="admin-stats-recent-time">
                            {formatTime(item.createdAt, language)}
                          </span>
                          <button
                            type="button"
                            className="admin-stats-copy-btn"
                            onClick={() => copyFeedback(item)}
                            title={t('stats.copyFeedback')}
                            aria-label={t('stats.copyFeedback')}
                          >
                            {copiedId === item.id ? t('stats.copied') : t('stats.copy')}
                          </button>
                          <button
                            type="button"
                            className="admin-stats-copy-btn admin-stats-delete-btn"
                            onClick={() => deleteFeedback(item)}
                            disabled={deletingId === item.id}
                            title={t('stats.deleteFeedback')}
                            aria-label={t('stats.deleteFeedback')}
                          >
                            {deletingId === item.id ? '…' : t('stats.delete')}
                          </button>
                        </span>
                      </div>
                      <p className="admin-stats-feedback-msg">{item.message}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default AdminStatsModal;
