// İstatistik: giriş/aktivite kaydı + bellek içi online (kim / son görülme).
const config = require('./config');
const { isAdminUsername } = require('./auth');

const EVENT_NAME_RE = /^[a-z][a-z0-9_]{1,39}$/;

const ACTIVITY_EVENT_NAMES = new Set([
  'login',
  'register',
  'visit',
  'binder_saved',
  'share_sent',
]);

const isAdmin = (user) => Boolean(user && isAdminUsername(user.username));

const isValidClientId = (clientId) =>
  typeof clientId === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(clientId);

const shortClientId = (clientId) =>
  typeof clientId === 'string' && clientId.length >= 4 ? clientId.slice(0, 4) : '????';

function createPresenceStore({ ttlMs = config.stats.presenceTtlMs, now = Date.now } = {}) {
  // clientId → { lastSeen, firstSeen, userId, username, silent, lastAction }
  const clients = new Map();

  const prune = () => {
    const cutoff = now() - ttlMs;
    for (const [id, entry] of clients) {
      if (entry.lastSeen < cutoff) clients.delete(id);
    }
  };

  const touch = (clientId, userId = null, opts = {}) => {
    const silent = Boolean(opts.silent);
    const username = opts.username || null;
    const action = opts.action || null;
    const existing = clients.get(clientId);
    const ts = now();
    const isNew = !existing;
    clients.set(clientId, {
      lastSeen: ts,
      firstSeen: existing?.firstSeen || ts,
      userId: userId || null,
      username: username || existing?.username || null,
      silent,
      lastAction: action || existing?.lastAction || (userId ? 'online' : 'visit'),
    });
    if (clients.size >= 200 && clients.size % 200 === 0) prune();
    return { isNew };
  };

  return {
    touch,
    leave(clientId) {
      if (!clientId) return false;
      return clients.delete(clientId);
    },
    markAction(userId, action) {
      if (!userId || !action) return;
      const ts = now();
      for (const entry of clients.values()) {
        if (entry.userId === userId && !entry.silent) {
          entry.lastSeen = ts;
          entry.lastAction = action;
        }
      }
    },
    counts() {
      prune();
      const users = new Set();
      let guests = 0;
      for (const entry of clients.values()) {
        if (entry.silent) continue;
        if (entry.userId) users.add(entry.userId);
        else guests += 1;
      }
      return { total: users.size + guests, users: users.size, guests };
    },
    people() {
      prune();
      const byUser = new Map();
      const guests = [];
      for (const [clientId, entry] of clients) {
        if (entry.silent) continue;
        if (entry.userId) {
          const prev = byUser.get(entry.userId);
          if (!prev || entry.lastSeen > prev.lastSeen) {
            byUser.set(entry.userId, {
              kind: 'user',
              username: entry.username || null,
              lastSeen: entry.lastSeen,
              firstSeen: entry.firstSeen,
              lastAction: entry.lastAction || 'online',
            });
          } else if (prev && entry.firstSeen < prev.firstSeen) {
            prev.firstSeen = entry.firstSeen;
          }
        } else {
          guests.push({
            kind: 'guest',
            clientId: shortClientId(clientId),
            lastSeen: entry.lastSeen,
            firstSeen: entry.firstSeen,
            lastAction: entry.lastAction || 'visit',
          });
        }
      }
      const list = [...byUser.values(), ...guests].sort((a, b) => b.lastSeen - a.lastSeen);
      return list.map((p) => ({
        ...p,
        lastSeen: new Date(p.lastSeen).toISOString(),
        firstSeen: new Date(p.firstSeen).toISOString(),
      }));
    },
    size() {
      return clients.size;
    },
  };
}

async function recordEvent(pool, { name, userId = null, clientId = null, props = {}, username = null }) {
  if (username && isAdminUsername(username)) return false;
  if (!EVENT_NAME_RE.test(name)) return false;
  try {
    await pool.query(
      'INSERT INTO events (name, user_id, client_id, props) VALUES ($1, $2, $3, $4)',
      [name, userId, clientId, JSON.stringify(props || {})]
    );
    return true;
  } catch (error) {
    console.warn('[stats] event kaydedilemedi:', error.message);
    return false;
  }
}

async function purgeOldEvents(pool, days = config.stats.eventRetentionDays) {
  await pool.query("DELETE FROM events WHERE created_at < now() - ($1::int * interval '1 day')", [days]);
}

async function collectStats(pool, presence) {
  const admins = [...config.adminUsernames];
  const [
    { rows: loginCountRows },
    { rows: eventCountRows },
    { rows: uniqueRows },
    { rows: recentLoginRows },
    { rows: activityRows },
    { rows: feedbackCountRows },
  ] = await Promise.all([
    pool.query(
      `
      SELECT count(*) FILTER (WHERE e.created_at >= date_trunc('day', now()))::int AS today,
             count(*) FILTER (WHERE e.created_at >= now() - interval '7 days')::int AS week
        FROM events e
        JOIN users u ON u.id = e.user_id
       WHERE e.name IN ('login', 'register')
         AND lower(u.username) <> ALL($1::text[])`,
      [admins]
    ),
    pool.query(
      `
      SELECT
        count(*) FILTER (WHERE e.name = 'register' AND e.created_at >= date_trunc('day', now()))::int AS registers_today,
        count(*) FILTER (WHERE e.name = 'register' AND e.created_at >= now() - interval '7 days')::int AS registers_week,
        count(*) FILTER (WHERE e.name = 'visit' AND e.created_at >= date_trunc('day', now()))::int AS visits_today,
        count(*) FILTER (WHERE e.name = 'visit' AND e.created_at >= now() - interval '7 days')::int AS visits_week,
        count(*) FILTER (WHERE e.name = 'binder_saved' AND e.created_at >= date_trunc('day', now()))::int AS saves_today,
        count(*) FILTER (WHERE e.name = 'binder_saved' AND e.created_at >= now() - interval '7 days')::int AS saves_week,
        count(*) FILTER (WHERE e.name = 'share_sent' AND e.created_at >= date_trunc('day', now()))::int AS shares_today,
        count(*) FILTER (WHERE e.name = 'share_sent' AND e.created_at >= now() - interval '7 days')::int AS shares_week
        FROM events e
        LEFT JOIN users u ON u.id = e.user_id
       WHERE e.name = ANY($2::text[])
         AND (u.username IS NULL OR lower(u.username) <> ALL($1::text[]))`,
      [admins, [...ACTIVITY_EVENT_NAMES]]
    ),
    pool.query(
      `
      SELECT count(DISTINCT e.user_id)::int AS active_users_week
        FROM events e
        JOIN users u ON u.id = e.user_id
       WHERE e.created_at >= now() - interval '7 days'
         AND e.user_id IS NOT NULL
         AND lower(u.username) <> ALL($1::text[])`,
      [admins]
    ),
    pool.query(
      `
      SELECT u.username, e.name, e.created_at
        FROM events e
        JOIN users u ON u.id = e.user_id
       WHERE e.name IN ('login', 'register')
         AND lower(u.username) <> ALL($1::text[])
       ORDER BY e.created_at DESC
       LIMIT 40`,
      [admins]
    ),
    pool.query(
      `
      SELECT e.name, e.created_at, e.client_id, u.username
        FROM events e
        LEFT JOIN users u ON u.id = e.user_id
       WHERE e.name = ANY($2::text[])
         AND e.created_at >= now() - interval '24 hours'
         AND (u.username IS NULL OR lower(u.username) <> ALL($1::text[]))
       ORDER BY e.created_at DESC
       LIMIT 60`,
      [admins, [...ACTIVITY_EVENT_NAMES]]
    ),
    pool.query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE created_at >= date_trunc('day', now()))::int AS today
         FROM feedback`
    ).catch(() => ({ rows: [{ total: 0, today: 0 }] })),
  ]);

  const onlineCounts = presence?.counts?.() || { total: 0, users: 0, guests: 0 };
  const people = typeof presence?.people === 'function' ? presence.people() : [];
  const ev = eventCountRows[0] || {};

  return {
    generatedAt: new Date().toISOString(),
    online: {
      ...onlineCounts,
      people,
    },
    logins: {
      today: loginCountRows[0]?.today || 0,
      week: loginCountRows[0]?.week || 0,
    },
    summary: {
      registersToday: ev.registers_today || 0,
      registersWeek: ev.registers_week || 0,
      visitsToday: ev.visits_today || 0,
      visitsWeek: ev.visits_week || 0,
      savesToday: ev.saves_today || 0,
      savesWeek: ev.saves_week || 0,
      sharesToday: ev.shares_today || 0,
      sharesWeek: ev.shares_week || 0,
      activeUsersWeek: uniqueRows[0]?.active_users_week || 0,
      feedbackTotal: feedbackCountRows[0]?.total || 0,
      feedbackToday: feedbackCountRows[0]?.today || 0,
    },
    recentLogins: recentLoginRows.map((r) => ({
      username: r.username,
      kind: r.name,
      at: r.created_at,
    })),
    activity: activityRows.map((r) => ({
      name: r.name,
      at: r.created_at,
      username: r.username || null,
      guestId: r.username ? null : shortClientId(r.client_id),
    })),
  };
}

module.exports = {
  ACTIVITY_EVENT_NAMES,
  isAdmin,
  isValidClientId,
  createPresenceStore,
  recordEvent,
  purgeOldEvents,
  collectStats,
};
