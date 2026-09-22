const express = require('express');
const { HttpError, badRequest, wrap } = require('../errors');
const { requireAuth } = require('../auth');
const stats = require('../stats');

/**
 *  POST /api/presence     bellek içi heartbeat (DB yok; ilk misafir visit kaydı)
 *  GET  /api/admin/stats  online kişiler + aktivite (ADMIN_USERNAMES)
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

      const silent = stats.isAdmin(req.user);
      const { isNew } = presence.touch(clientId, req.user?.id || null, {
        silent,
        username: req.user?.username || null,
      });

      // İlk görülme: misafir ziyareti (admin sessiz; hesaplı için login zaten var)
      if (isNew && !silent && !req.user) {
        stats.recordEvent(pool, { name: 'visit', clientId }).catch(() => {});
      }

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
