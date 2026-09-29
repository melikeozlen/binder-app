const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { HttpError, badRequest, wrap } = require('../errors');
const auth = require('../auth');
const { recordEvent, isValidClientId } = require('../stats');
const {
  SECURITY_QUESTIONS,
  isValidSecurityQuestionId,
  normalizeSecurityAnswer,
  isValidSecurityAnswer,
  labelKeyForQuestionId,
} = require('../securityQuestions');

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
    const clientId = isValidClientId(req.body?.clientId) ? req.body.clientId : null;
    recordEvent(pool, {
      name: eventName,
      userId: userRow.id,
      clientId,
      username: userRow.username,
    });
    return { user: auth.toPublicUser(userRow) };
  };

  // İstemci: soru listesi (çeviri anahtarları)
  router.get('/security-questions', (req, res) => {
    res.json({
      questions: SECURITY_QUESTIONS.map((q) => ({ id: q.id, labelKey: q.labelKey })),
    });
  });

  // Unuttum: kullanıcı adına göre soru id (cevap yok)
  router.get(
    '/security-question',
    limiter,
    wrap(async (req, res) => {
      const username = auth.normalizeUsername(req.query?.username);
      if (!auth.isValidUsername(username)) {
        throw badRequest('INVALID_USERNAME', 'Invalid username');
      }
      const { rows } = await pool.query(
        `SELECT security_question_id FROM users
          WHERE lower(username) = lower($1) AND active = true`,
        [username]
      );
      const row = rows[0];
      if (!row?.security_question_id) {
        // Bilgi sızdırma: aynı generic cevap
        return res.json({ questionId: null });
      }
      res.json({ questionId: row.security_question_id });
    })
  );

  router.post(
    '/register',
    limiter,
    wrap(async (req, res) => {
      const { username, password } = readCredentials(req.body);
      const securityQuestionId = String(req.body?.securityQuestionId || '').trim();
      const securityAnswer = req.body?.securityAnswer;

      if (!isValidSecurityQuestionId(securityQuestionId)) {
        throw badRequest('INVALID_SECURITY_QUESTION', 'Pick a security question');
      }
      if (!isValidSecurityAnswer(securityAnswer)) {
        throw badRequest('WEAK_SECURITY_ANSWER', 'Security answer must be 2-64 characters');
      }

      const passwordHash = await auth.hashPassword(password);
      const answerHash = await auth.hashPassword(normalizeSecurityAnswer(securityAnswer));
      const id = crypto.randomUUID();

      let row;
      try {
        const result = await pool.query(
          `INSERT INTO users (
             id, username, password_hash,
             security_question_id, security_answer_hash, must_change_password
           )
           VALUES ($1, $2, $3, $4, $5, false)
           RETURNING id, username, created_at, active, must_change_password,
                     security_question_id, security_answer_hash`,
          [id, username, passwordHash, securityQuestionId, answerHash]
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
        `SELECT id, username, password_hash, created_at, active,
                must_change_password, security_question_id, security_answer_hash
           FROM users WHERE lower(username) = lower($1)`,
        [username]
      );
      const row = rows[0];
      if (!row) throw invalid();

      const ok = await auth.verifyPassword(password, row.password_hash);
      if (!ok) throw invalid();

      if (row.active === false) {
        throw new HttpError(403, 'ACCOUNT_DISABLED', 'This account is disabled');
      }

      res.json(await signIn(req, res, row, 'login'));
    })
  );

  // Şifre değiştir (girişli). must_change_password iken de zorunlu.
  router.post(
    '/change-password',
    auth.requireAuth,
    limiter,
    wrap(async (req, res) => {
      const currentPassword = req.body?.currentPassword;
      const newPassword = req.body?.newPassword;

      if (typeof currentPassword !== 'string' || !auth.isValidPassword(newPassword)) {
        throw badRequest('WEAK_PASSWORD', 'Password must be 8-128 characters');
      }
      if (currentPassword === newPassword) {
        throw badRequest('SAME_PASSWORD', 'New password must be different');
      }

      const { rows } = await pool.query(
        `SELECT id, password_hash, must_change_password,
                security_question_id, security_answer_hash, username, created_at, active
           FROM users WHERE id = $1`,
        [req.user.id]
      );
      const row = rows[0];
      if (!row) throw new HttpError(401, 'UNAUTHORIZED', 'Not signed in');

      const ok = await auth.verifyPassword(currentPassword, row.password_hash);
      if (!ok) {
        throw new HttpError(401, 'INVALID_CREDENTIALS', 'Current password is wrong');
      }

      const passwordHash = await auth.hashPassword(newPassword);
      const updated = await pool.query(
        `UPDATE users
            SET password_hash = $1, must_change_password = false
          WHERE id = $2
          RETURNING id, username, created_at, active, must_change_password,
                    security_question_id, security_answer_hash`,
        [passwordHash, row.id]
      );

      // Diğer cihazlardaki oturumları düşür; mevcut cookie kalsın
      if (req.sessionToken) {
        await pool.query(
          'DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2',
          [row.id, auth.hashToken(req.sessionToken)]
        );
      } else {
        await auth.destroyAllSessionsForUser(pool, row.id);
      }

      res.json({ user: auth.toPublicUser(updated.rows[0]) });
    })
  );

  // Şifre unuttum → geri bildirim kaydı (admin okur, geçici şifre verir)
  router.post(
    '/forgot-password',
    limiter,
    wrap(async (req, res) => {
      const username = auth.normalizeUsername(req.body?.username);
      const securityAnswer = req.body?.securityAnswer;
      const clientId = isValidClientId(req.body?.clientId) ? req.body.clientId : null;

      if (!auth.isValidUsername(username) || !isValidSecurityAnswer(securityAnswer)) {
        throw badRequest('INVALID_FORGOT', 'Username and security answer required');
      }

      const { rows } = await pool.query(
        `SELECT id, username, security_question_id, security_answer_hash, active
           FROM users WHERE lower(username) = lower($1)`,
        [username]
      );
      const row = rows[0];

      // Yanlış cevap / yok: generic başarı (enumerasyon azalt)
      let verified = false;
      if (row && row.active !== false && row.security_answer_hash) {
        verified = await auth.verifyPassword(
          normalizeSecurityAnswer(securityAnswer),
          row.security_answer_hash
        );
      }

      if (verified) {
        const qKey = labelKeyForQuestionId(row.security_question_id);
        const message = [
          '[PASSWORD_RESET]',
          `username: ${row.username}`,
          `questionId: ${row.security_question_id || '-'}`,
          `questionKey: ${qKey || '-'}`,
          `answer: ${normalizeSecurityAnswer(securityAnswer)}`,
          'Please send temporary password.',
        ].join('\n');

        await pool.query(
          `INSERT INTO feedback (user_id, client_id, username, anonymous, message)
           VALUES ($1, $2, $3, false, $4)`,
          [row.id, clientId, row.username, message]
        );
      }

      res.json({ ok: true });
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

  router.delete(
    '/me',
    auth.requireAuth,
    wrap(async (req, res) => {
      const userId = req.user.id;
      await pool.query('UPDATE users SET active = false WHERE id = $1', [userId]);
      await auth.destroyAllSessionsForUser(pool, userId);
      auth.clearSessionCookie(res);
      res.status(204).end();
    })
  );

  return router;
}

module.exports = { createAuthRouter };
