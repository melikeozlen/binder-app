const express = require('express');
const { HttpError, badRequest, wrap } = require('../errors');
const {
  requireAuth,
  isAdminUsername: authIsAdminUsername,
  destroyAllSessionsForUser: authDestroyAllSessionsForUser,
} = require('../auth');
const stats = require('../stats');

/**
 *  POST /api/presence       bellek içi heartbeat (DB yok; ilk misafir visit kaydı)
 *  POST /api/presence/leave sekme kapanınca listeden düş
 *  GET  /api/admin/stats    online kişiler + aktivite (ADMIN_USERNAMES)
 *  GET  /api/admin/users    hesap listesi
 *  POST /api/admin/users/:id/deactivate  hesabı pasife çek
 *  POST /api/admin/users/:id/activate    hesabı tekrar aktif et
 */
function createStatsRouter(pool, presence) {
  const router = express.Router();
  const json = express.json({ limit: '1kb' });

  const requireAdmin = (req) => {
    if (!stats.isAdmin(req.user)) throw new HttpError(403, 'FORBIDDEN', 'Admin only');
  };

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

  router.post(
    '/presence/leave',
    json,
    wrap(async (req, res) => {
      const clientId = req.body?.clientId;
      if (!stats.isValidClientId(clientId)) throw badRequest('INVALID_CLIENT_ID', 'Invalid client id');
      presence.leave(clientId);
      res.status(204).end();
    })
  );

  router.get(
    '/admin/stats',
    requireAuth,
    wrap(async (req, res) => {
      requireAdmin(req);
      res.setHeader('Cache-Control', 'no-store');
      res.json(await stats.collectStats(pool, presence));
    })
  );

  router.get(
    '/admin/users',
    requireAuth,
    wrap(async (req, res) => {
      requireAdmin(req);
      const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 100));
      const { rows } = await pool.query(
        `SELECT u.id, u.username, u.active, u.created_at,
                (
                  SELECT max(e.created_at)
                    FROM events e
                   WHERE e.user_id = u.id
                     AND e.name IN ('login', 'register')
                ) AS last_login_at
           FROM users u
          ORDER BY u.created_at DESC
          LIMIT $1`,
        [limit]
      );
      res.setHeader('Cache-Control', 'no-store');
      res.json({
        items: rows.map((r) => ({
          id: r.id,
          username: r.username,
          active: r.active !== false,
          isAdmin: authIsAdminUsername(r.username),
          createdAt: r.created_at,
          lastLoginAt: r.last_login_at,
        })),
      });
    })
  );

  const setUserActive = async (req, res, active) => {
    requireAdmin(req);
    const userId = String(req.params.id || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(userId)) {
      throw badRequest('INVALID_ID', 'Invalid user id');
    }
    if (userId === req.user.id) {
      throw badRequest('CANNOT_MODIFY_SELF', 'Cannot change your own account status');
    }
    const { rows } = await pool.query(
      'SELECT id, username, active FROM users WHERE id = $1',
      [userId]
    );
    const row = rows[0];
    if (!row) throw new HttpError(404, 'USER_NOT_FOUND', 'User not found');
    if (authIsAdminUsername(row.username)) {
      throw new HttpError(403, 'FORBIDDEN', 'Cannot modify admin accounts');
    }

    await pool.query('UPDATE users SET active = $2 WHERE id = $1', [userId, active]);
    if (!active) {
      await authDestroyAllSessionsForUser(pool, userId);
    }
    res.json({ id: userId, username: row.username, active });
  };

  router.post(
    '/admin/users/:id/deactivate',
    requireAuth,
    wrap(async (req, res) => setUserActive(req, res, false))
  );

  router.post(
    '/admin/users/:id/activate',
    requireAuth,
    wrap(async (req, res) => setUserActive(req, res, true))
  );

  return router;
}

module.exports = { createStatsRouter };
