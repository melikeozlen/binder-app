const express = require('express');
const { HttpError, badRequest, wrap } = require('../errors');
const { requireAuth } = require('../auth');
const stats = require('../stats');

/**
 *  POST /api/presence     bellek içi heartbeat (DB yok, limiter yok)
 *  GET  /api/admin/stats  online + giriş listesi (ADMIN_USERNAMES)
 */
function createStatsRouter(pool, presence) {
  const router = express.Router();
  const json = express.json({ limit: '1kb' });

  router.post(
    '/presence',
    json,
    wrap(async (req, res) => {
      const clientId = req.body?.clientId;
      if (!stats.isValidClientId(clientId)) throw badRequest('INVALID_CLIENT_ID', 'Invalid client id');
      presence.touch(clientId, req.user?.id || null, { silent: stats.isAdmin(req.user) });
      res.status(204).end();
    })
  );

  router.get(
    '/admin/stats',
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
