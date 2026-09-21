// İstatistik: giriş kaydı + bellek içi online sayacı (DB yazılmaz).
const config = require('./config');
const { isAdminUsername } = require('./auth');

const EVENT_NAME_RE = /^[a-z][a-z0-9_]{1,39}$/;

const isAdmin = (user) => Boolean(user && isAdminUsername(user.username));

const isValidClientId = (clientId) =>
  typeof clientId === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(clientId);

function createPresenceStore({ ttlMs = config.stats.presenceTtlMs, now = Date.now } = {}) {
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
      if (clients.size >= 200 && clients.size % 200 === 0) prune();
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
  const [{ rows: countRows }, { rows: recentRows }] = await Promise.all([
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
      SELECT u.username, e.name, e.created_at
        FROM events e
        JOIN users u ON u.id = e.user_id
       WHERE e.name IN ('login', 'register')
         AND lower(u.username) <> ALL($1::text[])
       ORDER BY e.created_at DESC
       LIMIT 80`,
      [admins]
    ),
  ]);

  return {
    online: presence?.counts?.() || { total: 0, users: 0, guests: 0 },
    logins: {
      today: countRows[0]?.today || 0,
      week: countRows[0]?.week || 0,
    },
    recentLogins: recentRows.map((r) => ({
      username: r.username,
      kind: r.name,
      at: r.created_at,
    })),
  };
}

module.exports = {
  isAdmin,
  isValidClientId,
  createPresenceStore,
  recordEvent,
  purgeOldEvents,
  collectStats,
};
