const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const config = require('./config');
const { unauthorized } = require('./errors');

const BCRYPT_ROUNDS = 10;
// 3-32 karakter: harf, rakam, _ ve .
const USERNAME_RE = /^[A-Za-z0-9_.]{3,32}$/;

const normalizeUsername = (username) => String(username || '').trim();
const isValidUsername = (username) => USERNAME_RE.test(username);
const isValidPassword = (password) =>
  typeof password === 'string' && password.length >= 8 && password.length <= 128;

const hashPassword = (password) => bcrypt.hash(password, BCRYPT_ROUNDS);
const verifyPassword = (password, hash) => bcrypt.compare(password, hash);

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const isAdminUsername = (username) =>
  Boolean(username) && config.adminUsernames.has(String(username).toLowerCase());

const toPublicUser = (row) => ({
  id: row.id,
  username: row.username,
  createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  // İstatistik panelini görebilir mi (ADMIN_USERNAMES). Yetki kontrolü yine sunucuda yapılır.
  isAdmin: isAdminUsername(row.username),
});

function cookieOptions() {
  return {
    httpOnly: true,
    secure: config.isProd,
    sameSite: config.crossSiteCookies ? 'none' : 'lax',
    path: '/',
    maxAge: config.sessionTtlMs,
  };
}

async function createSession(pool, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + config.sessionTtlMs);
  await pool.query(
    'INSERT INTO sessions (token_hash, user_id, expires_at, last_seen_at) VALUES ($1, $2, $3, now())',
    [hashToken(token), userId, expiresAt]
  );
  return token;
}

async function destroySession(pool, token) {
  if (!token) return;
  await pool.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
}

function setSessionCookie(res, token) {
  res.cookie(config.sessionCookieName, token, cookieOptions());
}

function clearSessionCookie(res) {
  const { maxAge, ...rest } = cookieOptions();
  res.clearCookie(config.sessionCookieName, rest);
}

// Her istekte: cookie → session → req.user (yoksa null)
function attachUser(pool) {
  return async (req, res, next) => {
    req.user = null;
    req.sessionToken = req.cookies?.[config.sessionCookieName] || null;
    if (!req.sessionToken) return next();

    try {
      const { rows } = await pool.query(
        `SELECT u.id, u.username, u.created_at
           FROM sessions s
           JOIN users u ON u.id = s.user_id
          WHERE s.token_hash = $1 AND s.expires_at > now()`,
        [hashToken(req.sessionToken)]
      );
      if (rows[0]) {
        req.user = toPublicUser(rows[0]);
      } else {
        clearSessionCookie(res);
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

function requireAuth(req, res, next) {
  if (!req.user) return next(unauthorized());
  next();
}

async function purgeExpiredSessions(pool) {
  await pool.query('DELETE FROM sessions WHERE expires_at < now()');
}

module.exports = {
  normalizeUsername,
  isValidUsername,
  isValidPassword,
  hashPassword,
  verifyPassword,
  hashToken,
  isAdminUsername,
  toPublicUser,
  createSession,
  destroySession,
  setSessionCookie,
  clearSessionCookie,
  attachUser,
  requireAuth,
  purgeExpiredSessions,
};
