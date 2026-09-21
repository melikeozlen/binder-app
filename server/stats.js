// İstatistik altyapısı: presence (bellek içi), olay kaydı (DB), admin kontrolü.
//
// Presence tek süreçte bellek içinde tutulur (Railway tek instance). Yeniden başlatmada
// sıfırlanır ve ilk heartbeat'lerle (≤60 sn) kendini yeniden doldurur; kalıcı veri gerekmez.
const config = require('./config');
const { isAdminUsername } = require('./auth');

const EVENT_NAME_RE = /^[a-z][a-z0-9_]{1,39}$/;

// İstemcinin gönderebileceği olaylar (spam / keyfi isim yazılmasın). login/register sunucuda yazılır.
const CLIENT_EVENT_NAMES = new Set([
  'visit',
  'binder_created',
  'binder_saved',
  'binder_exported',
  'binder_imported',
  'share_sent',
  'zip_download',
  'image_download',
]);

const isAdmin = (user) => Boolean(user && isAdminUsername(user.username));

const isValidClientId = (clientId) =>
  typeof clientId === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(clientId);

function createPresenceStore({ ttlMs = config.stats.presenceTtlMs, now = Date.now } = {}) {
  // clientId → { lastSeen, userId }
  const clients = new Map();

  const prune = () => {
    const cutoff = now() - ttlMs;
    for (const [id, entry] of clients) {
      if (entry.lastSeen < cutoff) clients.delete(id);
    }
  };

  return {
    touch(clientId, userId = null, { silent = false } = {}) {
      clients.set(clientId, { lastSeen: now(), userId: userId || null, silent: Boolean(silent) });
      // Harita büyümesin: her 200 dokunuşta bir eskileri at
      if (clients.size % 200 === 0) prune();
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
    size() {
      return clients.size;
    },
  };
}

// Olay kaydı. Admin hesaplar (ADMIN_USERNAMES, örn. kepcang) yazılmaz.
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

// Yönetici özeti (tek sorgu turu; tüm sayılar birlikte döner)
async function collectStats(pool, presence) {
  const admins = [...config.adminUsernames];
  const notAdminUser = `
    (e.user_id IS NULL OR e.user_id NOT IN (
      SELECT id FROM users WHERE lower(username) = ANY($1::text[])
    ))`;
  const [
    { rows: userRows },
    { rows: loginRows },
    { rows: activeRows },
    { rows: binderRows },
    { rows: imageRows },
    { rows: eventRows },
    { rows: recentRows },
  ] = await Promise.all([
    pool.query(`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE created_at >= date_trunc('day', now()))::int AS today,
             count(*) FILTER (WHERE created_at >= now() - interval '7 days')::int AS week
        FROM users`),
    pool.query(
      `
      SELECT count(*) FILTER (WHERE name = 'login' AND created_at >= date_trunc('day', now()))::int AS login_today,
             count(*) FILTER (WHERE name = 'login' AND created_at >= now() - interval '7 days')::int AS login_week,
             count(*) FILTER (WHERE name = 'visit' AND created_at >= date_trunc('day', now()))::int AS visit_today,
             count(*) FILTER (WHERE name = 'visit' AND created_at >= now() - interval '7 days')::int AS visit_week,
             count(DISTINCT client_id) FILTER (WHERE name = 'visit' AND created_at >= date_trunc('day', now()))::int AS visitors_today,
             count(DISTINCT client_id) FILTER (WHERE name = 'visit' AND created_at >= now() - interval '7 days')::int AS visitors_week
        FROM events e
       WHERE name IN ('login', 'visit')
         AND created_at >= now() - interval '7 days'
         AND ${notAdminUser}`,
      [admins]
    ),
    pool.query(
      `
      SELECT count(DISTINCT s.user_id) FILTER (WHERE coalesce(s.last_seen_at, s.created_at) >= date_trunc('day', now()))::int AS today,
             count(DISTINCT s.user_id) FILTER (WHERE coalesce(s.last_seen_at, s.created_at) >= now() - interval '7 days')::int AS week,
             count(*) FILTER (WHERE s.expires_at > now())::int AS open_sessions
        FROM sessions s
        JOIN users u ON u.id = s.user_id
       WHERE lower(u.username) <> ALL($1::text[])`,
      [admins]
    ),
    pool.query(`
      SELECT (SELECT count(*)::int FROM binders) AS total,
             (SELECT count(*)::int FROM binder_members) AS memberships,
             (SELECT count(*)::int FROM binders WHERE updated_at >= now() - interval '7 days') AS updated_week`),
    pool.query('SELECT count(*)::int AS count, coalesce(sum(size_bytes), 0)::bigint AS bytes FROM images'),
    pool.query(
      `
      SELECT e.name,
             count(*) FILTER (WHERE e.created_at >= date_trunc('day', now()))::int AS today,
             count(*) FILTER (WHERE e.created_at >= now() - interval '7 days')::int AS week,
             count(*)::int AS total
        FROM events e
       WHERE e.name NOT IN ('visit')
         AND ${notAdminUser}
       GROUP BY e.name
       ORDER BY week DESC, total DESC`,
      [admins]
    ),
    pool.query(
      `
      SELECT u.username, e.created_at
        FROM events e
        JOIN users u ON u.id = e.user_id
       WHERE e.name IN ('login', 'register')
         AND lower(u.username) <> ALL($1::text[])
       ORDER BY e.created_at DESC
       LIMIT 10`,
      [admins]
    ),
  ]);

  const l = loginRows[0] || {};
  return {
    generatedAt: new Date().toISOString(),
    online: presence.counts(),
    users: userRows[0],
    logins: { today: l.login_today || 0, week: l.login_week || 0 },
    visits: {
      today: l.visit_today || 0,
      week: l.visit_week || 0,
      visitorsToday: l.visitors_today || 0,
      visitorsWeek: l.visitors_week || 0,
    },
    activeUsers: activeRows[0],
    binders: binderRows[0],
    images: { count: imageRows[0].count, bytes: Number(imageRows[0].bytes) },
    events: eventRows,
    recentLogins: recentRows.map((r) => ({ username: r.username, at: r.created_at })),
  };
}

module.exports = {
  CLIENT_EVENT_NAMES,
  isAdminUsername,
  isAdmin,
  isValidClientId,
  createPresenceStore,
  recordEvent,
  purgeOldEvents,
  collectStats,
};
