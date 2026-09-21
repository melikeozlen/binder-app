const express = require('express');
const { HttpError, wrap } = require('../errors');
const { requireAuth } = require('../auth');
const stats = require('../stats');

/**
 *  GET /api/admin/stats  giriş listesi (ADMIN_USERNAMES)
 */
function createStatsRouter(pool) {
  const router = express.Router();

  router.get(
    '/admin/stats',
    requireAuth,
    wrap(async (req, res) => {
      if (!stats.isAdmin(req.user)) throw new HttpError(403, 'FORBIDDEN', 'Admin only');
      res.setHeader('Cache-Control', 'no-store');
      res.json(await stats.collectStats(pool));
    })
  );

  return router;
}

module.exports = { createStatsRouter };
