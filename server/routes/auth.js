const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { HttpError, badRequest, wrap } = require('../errors');
const auth = require('../auth');
const { recordEvent, isValidClientId } = require('../stats');

const PG_UNIQUE_VIOLATION = '23505';

function createAuthRouter(pool) {
  const router = express.Router();
  router.use(express.json({ limit: '10kb' }));

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) =>
      res.status(429).json({ error: 'Too many attempts, try again later', code: 'RATE_LIMITED' }),
  });

  const readCredentials = (body) => {
    const username = auth.normalizeUsername(body?.username);
    const password = body?.password;
    if (!auth.isValidUsername(username)) {
      throw badRequest('INVALID_USERNAME', 'Username must be 3-32 chars: letters, digits, _ or .');
    }
    if (!auth.isValidPassword(password)) {
      throw badRequest('WEAK_PASSWORD', 'Password must be 8-128 characters');
    }
    return { username, password };
  };

  const signIn = async (req, res, userRow, eventName) => {
    const token = await auth.createSession(pool, userRow.id);
    auth.setSessionCookie(res, token);
    // İstatistik: giriş/kayıt olayı (beklenmez; hata cevabı etkilemez)
    const clientId = isValidClientId(req.body?.clientId) ? req.body.clientId : null;
    recordEvent(pool, {
      name: eventName,
      userId: userRow.id,
      clientId,
      username: userRow.username,
    });
    return { user: auth.toPublicUser(userRow) };
  };

  router.post(
    '/register',
    limiter,
    wrap(async (req, res) => {
      const { username, password } = readCredentials(req.body);
      const passwordHash = await auth.hashPassword(password);
      const id = crypto.randomUUID();

      let row;
      try {
        const result = await pool.query(
          `INSERT INTO users (id, username, password_hash)
           VALUES ($1, $2, $3)
           RETURNING id, username, created_at`,
          [id, username, passwordHash]
        );
        row = result.rows[0];
      } catch (error) {
        if (error.code === PG_UNIQUE_VIOLATION) {
          throw new HttpError(409, 'USERNAME_EXISTS', 'Username is already taken');
        }
        throw error;
      }

      res.status(201).json(await signIn(req, res, row, 'register'));
    })
  );

  router.post(
    '/login',
    limiter,
    wrap(async (req, res) => {
      const username = auth.normalizeUsername(req.body?.username);
      const password = req.body?.password;

      const invalid = () =>
        new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid username or password');

      if (!auth.isValidUsername(username) || typeof password !== 'string') throw invalid();

      const { rows } = await pool.query(
        'SELECT id, username, password_hash, created_at FROM users WHERE lower(username) = lower($1)',
        [username]
      );
      const row = rows[0];
      if (!row) throw invalid();

      const ok = await auth.verifyPassword(password, row.password_hash);
      if (!ok) throw invalid();

      res.json(await signIn(req, res, row, 'login'));
    })
  );

  router.post(
    '/logout',
    wrap(async (req, res) => {
      await auth.destroySession(pool, req.sessionToken);
      auth.clearSessionCookie(res);
      res.status(204).end();
    })
  );

  router.get('/me', (req, res) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not signed in', code: 'UNAUTHORIZED' });
    }
    res.json({ user: req.user });
  });

  return router;
}

module.exports = { createAuthRouter };
