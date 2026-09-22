const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { HttpError, badRequest, notFound, wrap } = require('../errors');
const { requireAuth, normalizeUsername, isValidUsername } = require('../auth');
const { withTransaction } = require('../db');
const { recordEvent } = require('../stats');

const PG_UNIQUE_VIOLATION = '23505';
const BINDER_ID_RE = /^[A-Za-z0-9_.:-]{1,120}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const toMs = (d) => (d instanceof Date ? d.getTime() : Number(d) || null);

const ROLES = new Set(['edit', 'view']);
const validateRole = (role, fallback = 'edit') => {
  if (role === undefined || role === null || role === '') return fallback;
  if (!ROLES.has(role)) throw badRequest('INVALID_ROLE', "role must be 'edit' or 'view'");
  return role;
};

const validateShareId = (id) => {
  if (!UUID_RE.test(String(id || ''))) throw badRequest('INVALID_SHARE_ID', 'Invalid share id');
  return id;
};

const mapShare = (r) => ({
  id: r.id,
  binderId: r.binder_id,
  binderName: r.binder_name,
  status: r.status,
  fromUsername: r.from_username,
  toUsername: r.to_username,
  role: r.role === 'view' ? 'view' : 'edit',
  createdAt: toMs(r.created_at),
});

/**
 * Binder paylaşımı: binder'ın tek sahibi vardır, kabul eden kişi üye olur (aynı binder).
 *  GET    /                              bekleyenler (incoming/outgoing) + aktif üyelikler
 *                                        (members: benim binder'larımdaki üyeler,
 *                                         sharedWithMe: bana paylaşılan binder'lar)
 *  POST   /                              { binderId, toUsername, role? } → bekleyen davet (yalnızca sahip)
 *                                        role: 'edit' (varsayılan) | 'view' (sadece görüntüleme)
 *  POST   /:id/accept                    alıcı: üye ol
 *  POST   /:id/reject                    alıcı: reddet
 *  DELETE /:id                           gönderen: bekleyen daveti iptal et
 *  PATCH  /members/:binderId/:userId     sahip: { role } üyenin yetkisini değiştir
 *  DELETE /members/:binderId/:userId     sahip: üyeyi kaldır
 */
function createSharesRouter(pool) {
  const router = express.Router();
  router.use(requireAuth);
  router.use(express.json({ limit: '10kb' }));

  // Kullanıcı adı tarama / spam'e karşı gönderim limiti
  const sendLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 60,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) =>
      res.status(429).json({ error: 'Too many share requests, try again later', code: 'RATE_LIMITED' }),
  });

  const selectShares = `
    SELECT s.id, s.binder_id, s.binder_name, s.status, s.role, s.created_at, s.from_user_id, s.to_user_id,
           fu.username AS from_username, tu.username AS to_username
      FROM binder_shares s
      JOIN users fu ON fu.id = s.from_user_id
      JOIN users tu ON tu.id = s.to_user_id`;

  router.get(
    '/',
    wrap(async (req, res) => {
      const [{ rows }, { rows: memberRows }, { rows: sharedRows }] = await Promise.all([
        pool.query(
          `${selectShares}
            WHERE s.status = 'pending' AND (s.to_user_id = $1 OR s.from_user_id = $1)
            ORDER BY s.created_at DESC`,
          [req.user.id]
        ),
        // Benim binder'larıma erişimi olan üyeler
        pool.query(
          `SELECT m.binder_id, b.name AS binder_name, m.user_id, u.username, m.role, m.created_at
             FROM binder_members m
             JOIN binders b ON b.user_id = m.owner_id AND b.id = m.binder_id
             JOIN users u ON u.id = m.user_id
            WHERE m.owner_id = $1
            ORDER BY b.name, u.username`,
          [req.user.id]
        ),
        // Bana paylaşılan binder'lar
        pool.query(
          `SELECT m.binder_id, b.name AS binder_name, m.owner_id, u.username AS owner_username, m.role, m.created_at
             FROM binder_members m
             JOIN binders b ON b.user_id = m.owner_id AND b.id = m.binder_id
             JOIN users u ON u.id = m.owner_id
            WHERE m.user_id = $1
            ORDER BY b.name`,
          [req.user.id]
        ),
      ]);
      res.json({
        incoming: rows.filter((r) => r.to_user_id === req.user.id).map(mapShare),
        outgoing: rows.filter((r) => r.from_user_id === req.user.id).map(mapShare),
        members: memberRows.map((r) => ({
          binderId: r.binder_id,
          binderName: r.binder_name,
          userId: r.user_id,
          username: r.username,
          role: r.role === 'view' ? 'view' : 'edit',
          since: toMs(r.created_at),
        })),
        sharedWithMe: sharedRows.map((r) => ({
          binderId: r.binder_id,
          binderName: r.binder_name,
          ownerId: r.owner_id,
          ownerUsername: r.owner_username,
          role: r.role === 'view' ? 'view' : 'edit',
          since: toMs(r.created_at),
        })),
      });
    })
  );

  router.post(
    '/',
    sendLimiter,
    wrap(async (req, res) => {
      const binderId = String(req.body?.binderId || '');
      if (!BINDER_ID_RE.test(binderId)) throw badRequest('INVALID_BINDER_ID', 'Invalid binder id');

      const toUsername = normalizeUsername(req.body?.toUsername);
      if (!isValidUsername(toUsername)) {
        throw badRequest('INVALID_USERNAME', 'Invalid username');
      }
      const role = validateRole(req.body?.role);

      const { rows: users } = await pool.query(
        'SELECT id, username FROM users WHERE lower(username) = lower($1)',
        [toUsername]
      );
      const target = users[0];
      if (!target) throw notFound('USER_NOT_FOUND');
      if (target.id === req.user.id) throw badRequest('SELF_SHARE', 'Cannot share with yourself');

      // Yalnızca sahip paylaşabilir
      const { rows: binders } = await pool.query(
        'SELECT name FROM binders WHERE user_id = $1 AND id = $2',
        [req.user.id, binderId]
      );
      if (!binders[0]) throw notFound('BINDER_NOT_FOUND');

      const { rowCount: alreadyMember } = await pool.query(
        'SELECT 1 FROM binder_members WHERE owner_id = $1 AND binder_id = $2 AND user_id = $3',
        [req.user.id, binderId, target.id]
      );
      if (alreadyMember > 0) {
        throw new HttpError(409, 'ALREADY_MEMBER', 'User already has access to this binder');
      }

      const id = crypto.randomUUID();
      let row;
      try {
        const result = await pool.query(
          `INSERT INTO binder_shares (id, from_user_id, to_user_id, binder_id, binder_name, role)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, binder_id, binder_name, status, role, created_at`,
          [id, req.user.id, target.id, binderId, binders[0].name, role]
        );
        row = result.rows[0];
      } catch (error) {
        if (error.code === PG_UNIQUE_VIOLATION) {
          throw new HttpError(409, 'SHARE_EXISTS', 'A pending share to this user already exists');
        }
        throw error;
      }

      res.status(201).json({
        share: mapShare({ ...row, from_username: req.user.username, to_username: target.username }),
      });

      recordEvent(pool, {
        name: 'share_sent',
        userId: req.user.id,
        username: req.user.username,
        props: { binderId, to: target.username },
      }).catch(() => {});
      req.app.locals.presence?.markAction?.(req.user.id, 'share_sent');
    })
  );

  router.post(
    '/:id/accept',
    wrap(async (req, res) => {
      const shareId = validateShareId(req.params.id);

      const outcome = await withTransaction(pool, async (client) => {
        const { rows } = await client.query(
          `SELECT s.*, fu.username AS from_username
             FROM binder_shares s JOIN users fu ON fu.id = s.from_user_id
            WHERE s.id = $1 AND s.to_user_id = $2
            FOR UPDATE OF s`,
          [shareId, req.user.id]
        );
        const share = rows[0];
        if (!share) throw notFound('SHARE_NOT_FOUND');
        if (share.status !== 'pending') {
          throw new HttpError(409, 'SHARE_NOT_PENDING', 'Share is no longer pending');
        }

        const { rows: src } = await client.query(
          'SELECT name FROM binders WHERE user_id = $1 AND id = $2',
          [share.from_user_id, share.binder_id]
        );
        // Kaynak silinmişse transaction dışında iptal olarak işaretlenir
        if (!src[0]) return { sourceDeleted: true };

        // Aynı id ile kendi binder'ı varsa çakışma (pratikte olası değil)
        const { rowCount: clash } = await client.query(
          'SELECT 1 FROM binders WHERE user_id = $1 AND id = $2',
          [req.user.id, share.binder_id]
        );
        if (clash > 0) throw new HttpError(409, 'BINDER_ID_CLASH', 'You already have a binder with this id');

        await client.query(
          `INSERT INTO binder_members (owner_id, binder_id, user_id, role)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (owner_id, binder_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
          [share.from_user_id, share.binder_id, req.user.id, share.role === 'view' ? 'view' : 'edit']
        );
        await client.query(
          `UPDATE binder_shares SET status = 'accepted', responded_at = now() WHERE id = $1`,
          [shareId]
        );

        return {
          binderId: share.binder_id,
          name: src[0].name,
          ownerUsername: share.from_username,
          role: share.role === 'view' ? 'view' : 'edit',
        };
      });

      if (outcome.sourceDeleted) {
        await pool.query(
          `UPDATE binder_shares SET status = 'cancelled', responded_at = now()
            WHERE id = $1 AND status = 'pending'`,
          [shareId]
        );
        throw new HttpError(410, 'SHARE_SOURCE_DELETED', 'The shared binder no longer exists');
      }

      res.json(outcome);
    })
  );

  router.post(
    '/:id/reject',
    wrap(async (req, res) => {
      const shareId = validateShareId(req.params.id);
      const { rowCount } = await pool.query(
        `UPDATE binder_shares SET status = 'rejected', responded_at = now()
          WHERE id = $1 AND to_user_id = $2 AND status = 'pending'`,
        [shareId, req.user.id]
      );
      if (rowCount === 0) throw notFound('SHARE_NOT_FOUND');
      res.status(204).end();
    })
  );

  // Sahip: üyenin yetkisini değiştir
  router.patch(
    '/members/:binderId/:userId',
    wrap(async (req, res) => {
      const binderId = String(req.params.binderId || '');
      if (!BINDER_ID_RE.test(binderId)) throw badRequest('INVALID_BINDER_ID', 'Invalid binder id');
      const memberId = String(req.params.userId || '');
      if (!UUID_RE.test(memberId)) throw badRequest('INVALID_USER_ID', 'Invalid user id');
      const role = validateRole(req.body?.role, null);
      if (!role) throw badRequest('INVALID_ROLE', "role must be 'edit' or 'view'");
      const { rowCount } = await pool.query(
        'UPDATE binder_members SET role = $4 WHERE owner_id = $1 AND binder_id = $2 AND user_id = $3',
        [req.user.id, binderId, memberId, role]
      );
      if (rowCount === 0) throw notFound('MEMBER_NOT_FOUND');
      res.json({ binderId, userId: memberId, role });
    })
  );

  // Sahip: üyeyi kaldır
  router.delete(
    '/members/:binderId/:userId',
    wrap(async (req, res) => {
      const binderId = String(req.params.binderId || '');
      if (!BINDER_ID_RE.test(binderId)) throw badRequest('INVALID_BINDER_ID', 'Invalid binder id');
      const memberId = String(req.params.userId || '');
      if (!UUID_RE.test(memberId)) throw badRequest('INVALID_USER_ID', 'Invalid user id');
      const { rowCount } = await pool.query(
        'DELETE FROM binder_members WHERE owner_id = $1 AND binder_id = $2 AND user_id = $3',
        [req.user.id, binderId, memberId]
      );
      if (rowCount === 0) throw notFound('MEMBER_NOT_FOUND');
      res.status(204).end();
    })
  );

  router.delete(
    '/:id',
    wrap(async (req, res) => {
      const shareId = validateShareId(req.params.id);
      const { rowCount } = await pool.query(
        `UPDATE binder_shares SET status = 'cancelled', responded_at = now()
          WHERE id = $1 AND from_user_id = $2 AND status = 'pending'`,
        [shareId, req.user.id]
      );
      if (rowCount === 0) throw notFound('SHARE_NOT_FOUND');
      res.status(204).end();
    })
  );

  return router;
}

module.exports = { createSharesRouter };
