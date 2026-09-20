const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const { HttpError, badRequest, notFound, wrap } = require('../errors');
const { requireAuth, normalizeUsername, isValidUsername } = require('../auth');
const { withTransaction } = require('../db');

const PG_UNIQUE_VIOLATION = '23505';
const BINDER_ID_RE = /^[A-Za-z0-9_.:-]{1,120}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const toMs = (d) => (d instanceof Date ? d.getTime() : Number(d) || null);

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
  createdAt: toMs(r.created_at),
});

/**
 * Binder paylaşımı (kopya gönderme).
 *  GET    /            bekleyen paylaşımlar: gelen (incoming) + gönderilen (outgoing)
 *  POST   /            { binderId, toUsername } → bekleyen paylaşım oluştur
 *  POST   /:id/accept  alıcı: binder + resimleri kendi hesabına kopyala
 *  POST   /:id/reject  alıcı: reddet
 *  DELETE /:id         gönderen: bekleyen paylaşımı iptal et
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
    SELECT s.id, s.binder_id, s.binder_name, s.status, s.created_at, s.from_user_id, s.to_user_id,
           fu.username AS from_username, tu.username AS to_username
      FROM binder_shares s
      JOIN users fu ON fu.id = s.from_user_id
      JOIN users tu ON tu.id = s.to_user_id`;

  router.get(
    '/',
    wrap(async (req, res) => {
      const { rows } = await pool.query(
        `${selectShares}
          WHERE s.status = 'pending' AND (s.to_user_id = $1 OR s.from_user_id = $1)
          ORDER BY s.created_at DESC`,
        [req.user.id]
      );
      res.json({
        incoming: rows.filter((r) => r.to_user_id === req.user.id).map(mapShare),
        outgoing: rows.filter((r) => r.from_user_id === req.user.id).map(mapShare),
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

      const { rows: users } = await pool.query(
        'SELECT id, username FROM users WHERE lower(username) = lower($1)',
        [toUsername]
      );
      const target = users[0];
      if (!target) throw notFound('USER_NOT_FOUND');
      if (target.id === req.user.id) throw badRequest('SELF_SHARE', 'Cannot share with yourself');

      const { rows: binders } = await pool.query(
        'SELECT name FROM binders WHERE user_id = $1 AND id = $2',
        [req.user.id, binderId]
      );
      if (!binders[0]) throw notFound('BINDER_NOT_FOUND');

      const id = crypto.randomUUID();
      let row;
      try {
        const result = await pool.query(
          `INSERT INTO binder_shares (id, from_user_id, to_user_id, binder_id, binder_name)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, binder_id, binder_name, status, created_at`,
          [id, req.user.id, target.id, binderId, binders[0].name]
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
    })
  );

  router.post(
    '/:id/accept',
    wrap(async (req, res) => {
      const shareId = validateShareId(req.params.id);

      const outcome = await withTransaction(pool, async (client) => {
        const { rows } = await client.query(
          'SELECT * FROM binder_shares WHERE id = $1 AND to_user_id = $2 FOR UPDATE',
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

        // Alıcı kotası: mevcut toplam + kopyalanacak resimler
        const [{ rows: mine }, { rows: theirs }] = await Promise.all([
          client.query(
            'SELECT COALESCE(SUM(size_bytes), 0)::bigint AS total FROM images WHERE user_id = $1',
            [req.user.id]
          ),
          client.query(
            `SELECT COALESCE(SUM(size_bytes), 0)::bigint AS total FROM images
              WHERE user_id = $1 AND binder_id = $2`,
            [share.from_user_id, share.binder_id]
          ),
        ]);
        if (Number(mine[0].total) + Number(theirs[0].total) > config.maxUserStorageBytes) {
          throw new HttpError(413, 'QUOTA_EXCEEDED', 'Storage quota exceeded');
        }

        const newId = `binder-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

        await client.query(
          `INSERT INTO binders
             (user_id, id, name, settings, gallery_urls, page_ids, pages, default_back_image, created_at, updated_at)
           SELECT $1, $2, name, settings, gallery_urls, page_ids, pages, default_back_image, now(), now()
             FROM binders WHERE user_id = $3 AND id = $4`,
          [req.user.id, newId, share.from_user_id, share.binder_id]
        );
        await client.query(
          `INSERT INTO images (user_id, binder_id, key, hash, data, size_bytes, updated_at)
           SELECT $1, $2, key, hash, data, size_bytes, now()
             FROM images WHERE user_id = $3 AND binder_id = $4`,
          [req.user.id, newId, share.from_user_id, share.binder_id]
        );
        await client.query(
          `UPDATE binder_shares SET status = 'accepted', responded_at = now() WHERE id = $1`,
          [shareId]
        );

        return { binderId: newId, name: src[0].name };
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
