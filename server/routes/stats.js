const express = require('express');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const { HttpError, badRequest, wrap } = require('../errors');
const { requireAuth } = require('../auth');
const auth = require('../auth');
const stats = require('../stats');

/**
 * İstatistik uçları.
 *  POST /api/presence        { clientId, visit? }  → 204  (heartbeat; misafir dahil)
 *  POST /api/events          { name, props? }      → 204  (izinli olay adları, bkz. stats.CLIENT_EVENT_NAMES)
 *  GET  /api/admin/stats     → özet (yalnızca ADMIN_USERNAMES)
 */
function createStatsRouter(pool, presence) {
  const router = express.Router();
  // JSON parser yalnızca bu POST'larda: /api altına mount edilince Drive gibi büyük
  // gövdeli isteklere 4kb limiti uygulanmasın.
  const json = express.json({ limit: '4kb' });

  const limiter = (limit, message) =>
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      handler: (req, res) => res.status(429).json({ error: message, code: 'RATE_LIMITED' }),
    });

  // Heartbeat ~60 sn'de bir; 15 dk'da 15 beklenir → çoklu sekme için pay bırak
  const presenceLimiter = limiter(120, 'Too many presence requests');
  const eventsLimiter = limiter(300, 'Too many events');
  const adminLimiter = limiter(60, 'Too many stats requests');

  router.post(
    '/presence',
    presenceLimiter,
    json,
    wrap(async (req, res) => {
      const clientId = req.body?.clientId;
      if (!stats.isValidClientId(clientId)) throw badRequest('INVALID_CLIENT_ID', 'Invalid clientId');

      const silent = stats.isAdmin(req.user);
      presence.touch(clientId, req.user?.id || null, { silent });

      // Oturum aktifliği: en fazla 60 sn'de bir yaz (her istekte DB yazımı olmasın)
      if (req.user && req.sessionToken) {
        pool
          .query(
            `UPDATE sessions
                SET last_seen_at = now()
              WHERE token_hash = $1
                AND (last_seen_at IS NULL OR last_seen_at < now() - ($2::int * interval '1 second'))`,
            [auth.hashToken(req.sessionToken), config.stats.lastSeenWriteIntervalSec]
          )
          .catch((error) => console.warn('[stats] last_seen_at yazılamadı:', error.message));
      }

      // Sayfa açılışı → ziyaret olayı (sekme başına bir kez, istemci karar verir)
      if (req.body?.visit === true && !silent) {
        stats.recordEvent(pool, {
          name: 'visit',
          userId: req.user?.id || null,
          clientId,
          username: req.user?.username,
        });
      }

      res.status(204).end();
    })
  );

  router.post(
    '/events',
    eventsLimiter,
    json,
    wrap(async (req, res) => {
      const name = req.body?.name;
      if (!stats.CLIENT_EVENT_NAMES.has(name)) throw badRequest('INVALID_EVENT', 'Unknown event');
      const clientId = stats.isValidClientId(req.body?.clientId) ? req.body.clientId : null;

      // props: küçük, düz bir nesne (string/number/boolean değerler)
      const props = {};
      const raw = req.body?.props;
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        for (const [key, value] of Object.entries(raw).slice(0, 10)) {
          if (!/^[a-zA-Z0-9_]{1,32}$/.test(key)) continue;
          if (typeof value === 'string') props[key] = value.slice(0, 100);
          else if (typeof value === 'number' || typeof value === 'boolean') props[key] = value;
        }
      }

      if (stats.isAdmin(req.user)) {
        res.status(204).end();
        return;
      }

      await stats.recordEvent(pool, {
        name,
        userId: req.user?.id || null,
        clientId,
        props,
        username: req.user?.username,
      });
      res.status(204).end();
    })
  );

  router.get(
    '/admin/stats',
    adminLimiter,
    requireAuth,
    wrap(async (req, res) => {
      if (!stats.isAdmin(req.user)) throw new HttpError(403, 'FORBIDDEN', 'Admin only');
      res.setHeader('Cache-Control', 'no-store');
      res.json(await stats.collectStats(pool, presence));
    })
  );

  return router;
}

module.exports = { createStatsRouter };
