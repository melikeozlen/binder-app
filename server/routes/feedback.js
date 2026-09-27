const express = require('express');
const rateLimit = require('express-rate-limit');
const { HttpError, badRequest, wrap } = require('../errors');
const { requireAuth } = require('../auth');
const { isAdmin, isValidClientId } = require('../stats');

const MAX_MESSAGE_LENGTH = 2000;
const MIN_MESSAGE_LENGTH = 3;

/**
 *  POST /api/feedback   herkes (giriş opsiyonel; rate limited)
 *  GET  /api/feedback   admin — son geri bildirimler
 */
function createFeedbackRouter(pool) {
  const router = express.Router();
  const json = express.json({ limit: '16kb' });

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 8,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) =>
      res.status(429).json({
        error: 'Too many feedback submissions, try again later',
        code: 'RATE_LIMITED',
      }),
  });

  router.post(
    '/',
    limiter,
    json,
    wrap(async (req, res) => {
      const raw = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
      if (raw.length < MIN_MESSAGE_LENGTH) {
        throw badRequest('INVALID_MESSAGE', 'Message is too short');
      }
      if (raw.length > MAX_MESSAGE_LENGTH) {
        throw badRequest('INVALID_MESSAGE', 'Message is too long');
      }

      const anonymous = Boolean(req.body?.anonymous);
      const clientId = isValidClientId(req.body?.clientId) ? req.body.clientId : null;
      const userId = req.user?.id || null;
      // Girişli + anonim değilse username kaydet; anonim veya misafir → null
      const username = userId && !anonymous ? req.user.username : null;

      const result = await pool.query(
        `INSERT INTO feedback (user_id, client_id, username, anonymous, message)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, created_at`,
        [userId, clientId, username, anonymous || !userId, raw]
      );

      res.status(201).json({
        id: result.rows[0].id,
        createdAt: result.rows[0].created_at,
      });
    })
  );

  router.get(
    '/',
    requireAuth,
    wrap(async (req, res) => {
      if (!isAdmin(req.user)) throw new HttpError(403, 'FORBIDDEN', 'Admin only');
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 40));
      const { rows } = await pool.query(
        `SELECT id, username, anonymous, message, client_id, created_at
         FROM feedback
         ORDER BY created_at DESC
         LIMIT $1`,
        [limit]
      );
      res.setHeader('Cache-Control', 'no-store');
      res.json({
        items: rows.map((r) => ({
          id: r.id,
          username: r.username,
          anonymous: Boolean(r.anonymous),
          message: r.message,
          clientId: r.client_id ? String(r.client_id).slice(-4) : null,
          createdAt: r.created_at,
        })),
      });
    })
  );

  return router;
}

module.exports = { createFeedbackRouter };
