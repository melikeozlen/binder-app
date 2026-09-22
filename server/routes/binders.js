const express = require('express');
const config = require('../config');
const { HttpError, badRequest, notFound, wrap } = require('../errors');
const { requireAuth } = require('../auth');
const { withTransaction } = require('../db');
const { fnv1a } = require('../lib/hash');
const { recordEvent } = require('../stats');

const BINDER_ID_RE = /^[A-Za-z0-9_.:-]{1,120}$/;
const IMAGE_KEY_RE = /^[A-Za-z0-9_.:-]{1,200}$/;
const IMAGE_REF_PREFIX = '__IMAGE_REF__';

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const toIso = (d) => (d instanceof Date ? d.toISOString() : d);
const toMs = (d) => (d instanceof Date ? d.getTime() : Number(d) || null);

function validateBinderId(id) {
  if (!BINDER_ID_RE.test(String(id || ''))) throw badRequest('INVALID_BINDER_ID', 'Invalid binder id');
  return id;
}

// Sayfalardaki tüm __IMAGE_REF__ anahtarlarını topla
function collectImageRefs(pages) {
  const keys = new Set();
  for (const page of pages) {
    for (const side of [page?.content, page?.backContent]) {
      if (!isPlainObject(side)) continue;
      for (const value of Object.values(side)) {
        if (typeof value === 'string' && value.startsWith(IMAGE_REF_PREFIX)) {
          keys.add(value.slice(IMAGE_REF_PREFIX.length));
        } else if (isPlainObject(value) && typeof value.url === 'string' && value.url.startsWith(IMAGE_REF_PREFIX)) {
          keys.add(value.url.slice(IMAGE_REF_PREFIX.length));
        }
      }
    }
  }
  return [...keys];
}

function validateDoc(body) {
  if (!isPlainObject(body)) throw badRequest('INVALID_BODY', 'Body must be an object');

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > config.limits.maxNameLength) {
    throw badRequest('INVALID_NAME', 'Binder name is required');
  }

  const settings = isPlainObject(body.settings) ? body.settings : {};
  const galleryUrls = Array.isArray(body.galleryUrls) ? body.galleryUrls : [];
  const pages = Array.isArray(body.pages) ? body.pages : [];
  if (pages.length > config.limits.maxPages) {
    throw badRequest('TOO_MANY_PAGES', `Max ${config.limits.maxPages} pages`);
  }
  for (const page of pages) {
    if (!isPlainObject(page) || page.id === undefined || page.id === null) {
      throw badRequest('INVALID_PAGE', 'Each page must be an object with an id');
    }
  }
  const pageIds = Array.isArray(body.pageIds) && body.pageIds.length > 0
    ? body.pageIds
    : pages.map((p) => p.id);

  let defaultBackImage = null;
  if (typeof body.defaultBackImage === 'string' && body.defaultBackImage) {
    if (Buffer.byteLength(body.defaultBackImage) > config.limits.maxDefaultBackImageBytes) {
      throw badRequest('IMAGE_TOO_LARGE', 'Default back image is too large');
    }
    defaultBackImage = body.defaultBackImage;
  }

  const createdAtMs = Number(body.createdAt);
  const createdAt = Number.isFinite(createdAtMs) && createdAtMs > 0 ? new Date(createdAtMs) : new Date();

  return { name, settings, galleryUrls, pageIds, pages, defaultBackImage, createdAt };
}

function validateImages(body) {
  if (!isPlainObject(body) || !isPlainObject(body.images)) {
    throw badRequest('INVALID_BODY', 'Body must be { images: { key: dataUrl } }');
  }
  const entries = Object.entries(body.images);
  if (entries.length === 0) throw badRequest('NO_IMAGES', 'No images provided');
  if (entries.length > config.limits.maxImagesPerRequest) {
    throw badRequest('TOO_MANY_IMAGES', `Max ${config.limits.maxImagesPerRequest} images per request`);
  }

  return entries.map(([key, data]) => {
    if (!IMAGE_KEY_RE.test(key)) throw badRequest('INVALID_IMAGE_KEY', `Invalid image key: ${key}`);
    if (typeof data !== 'string' || !data.startsWith('data:image/')) {
      throw badRequest('INVALID_IMAGE_DATA', `Image ${key} must be a data:image/* URL`);
    }
    const sizeBytes = Buffer.byteLength(data);
    if (sizeBytes > config.limits.maxImageBytes) {
      throw badRequest('IMAGE_TOO_LARGE', `Image ${key} is too large`);
    }
    return { key, data, sizeBytes, hash: fnv1a(data) };
  });
}

function createBindersRouter(pool) {
  const router = express.Router();
  router.use(requireAuth);

  const docJson = express.json({ limit: config.limits.docBody });
  const imagesJson = express.json({ limit: config.limits.imagesBody });
  const smallJson = express.json({ limit: '64kb' });

  /**
   * Binder erişimini çöz: { ownerId, role } → role: 'owner' | 'edit' | 'view'; erişim yoksa null.
   * Tüm binder/resim sorguları (owner_id, binder_id) ile yapılır.
   */
  const resolveAccess = async (client, userId, binderId) => {
    const own = await client.query('SELECT 1 FROM binders WHERE user_id = $1 AND id = $2', [userId, binderId]);
    if (own.rowCount > 0) return { ownerId: userId, role: 'owner' };
    const member = await client.query(
      'SELECT owner_id, role FROM binder_members WHERE user_id = $1 AND binder_id = $2',
      [userId, binderId]
    );
    const m = member.rows[0];
    return m ? { ownerId: m.owner_id, role: m.role === 'view' ? 'view' : 'edit' } : null;
  };

  const requireAccess = async (client, userId, binderId) => {
    const access = await resolveAccess(client, userId, binderId);
    if (!access) throw notFound('BINDER_NOT_FOUND');
    return access;
  };

  // Yazma: sahip ya da 'edit' üyesi; 'view' üyesi 403
  const assertWritable = (access) => {
    if (access && access.role === 'view') {
      throw new HttpError(403, 'READ_ONLY', 'You have view-only access to this binder');
    }
  };

  const listSelect = (roleExpr) => `
    SELECT b.id, b.name, b.created_at, b.updated_at, jsonb_array_length(b.pages) AS page_count,
           b.user_id AS owner_id, u.username AS owner_username, ${roleExpr} AS role
      FROM binders b
      JOIN users u ON u.id = b.user_id`;

  // Liste: kendi binder'larım + benimle paylaşılanlar
  router.get(
    '/',
    wrap(async (req, res) => {
      const { rows } = await pool.query(
        `${listSelect(`'owner'`)}
          WHERE b.user_id = $1
         UNION ALL
         ${listSelect('m.role')}
          JOIN binder_members m ON m.owner_id = b.user_id AND m.binder_id = b.id
          WHERE m.user_id = $1
         ORDER BY created_at ASC`,
        [req.user.id]
      );
      res.json({
        binders: rows.map((r) => ({
          id: r.id,
          name: r.name,
          createdAt: toMs(r.created_at),
          updatedAt: toIso(r.updated_at),
          pageCount: Number(r.page_count) || 0,
          ownerId: r.owner_id,
          ownerUsername: r.owner_username,
          shared: r.owner_id !== req.user.id,
          role: r.owner_id === req.user.id ? 'owner' : r.role === 'view' ? 'view' : 'edit',
        })),
      });
    })
  );

  // Tam doküman (resim verisi hariç)
  router.get(
    '/:id',
    wrap(async (req, res) => {
      const binderId = validateBinderId(req.params.id);
      const { ownerId, role } = await requireAccess(pool, req.user.id, binderId);
      const { rows } = await pool.query(
        `SELECT b.id, b.name, b.settings, b.gallery_urls, b.page_ids, b.pages, b.default_back_image,
                b.created_at, b.updated_at, u.username AS owner_username
           FROM binders b JOIN users u ON u.id = b.user_id
          WHERE b.user_id = $1 AND b.id = $2`,
        [ownerId, binderId]
      );
      const r = rows[0];
      if (!r) throw notFound('BINDER_NOT_FOUND');
      res.json({
        id: r.id,
        name: r.name,
        settings: r.settings,
        galleryUrls: r.gallery_urls,
        pageIds: r.page_ids,
        pages: r.pages,
        defaultBackImage: r.default_back_image,
        createdAt: toMs(r.created_at),
        updatedAt: toIso(r.updated_at),
        ownerId,
        ownerUsername: r.owner_username,
        shared: ownerId !== req.user.id,
        role,
      });
    })
  );

  // Upsert doküman; ardından referans verilmeyen resimleri temizle.
  // Üye ise sahibinin binder'ına yazar; yoksa kendi hesabında oluşturur.
  router.put(
    '/:id',
    docJson,
    wrap(async (req, res) => {
      const binderId = validateBinderId(req.params.id);
      const doc = validateDoc(req.body);
      const refs = collectImageRefs(doc.pages);

      const updatedAt = await withTransaction(pool, async (client) => {
        const access = await resolveAccess(client, req.user.id, binderId);
        assertWritable(access);
        const ownerId = access?.ownerId || req.user.id;
        const { rows } = await client.query(
          `INSERT INTO binders
             (user_id, id, name, settings, gallery_urls, page_ids, pages, default_back_image, created_at, updated_at)
           VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9, now())
           ON CONFLICT (user_id, id) DO UPDATE SET
             name = EXCLUDED.name,
             settings = EXCLUDED.settings,
             gallery_urls = EXCLUDED.gallery_urls,
             page_ids = EXCLUDED.page_ids,
             pages = EXCLUDED.pages,
             default_back_image = EXCLUDED.default_back_image,
             -- İstemci createdAt'in kaynağıdır (resimler önce yüklendiğinde oluşan
             -- placeholder satırın now() değeri burada düzeltilir)
             created_at = EXCLUDED.created_at,
             updated_at = now()
           RETURNING updated_at`,
          [
            ownerId,
            binderId,
            doc.name,
            JSON.stringify(doc.settings),
            JSON.stringify(doc.galleryUrls),
            JSON.stringify(doc.pageIds),
            JSON.stringify(doc.pages),
            doc.defaultBackImage,
            doc.createdAt,
          ]
        );

        await client.query(
          `DELETE FROM images
            WHERE user_id = $1 AND binder_id = $2 AND NOT (key = ANY($3::text[]))`,
          [ownerId, binderId, refs]
        );

        return toIso(rows[0].updated_at);
      });

      res.json({ id: binderId, updatedAt });

      // İstatistik: buluta kaydet (admin atlanır; presence'da son eylem)
      recordEvent(pool, {
        name: 'binder_saved',
        userId: req.user.id,
        username: req.user.username,
        props: { binderId },
      }).catch(() => {});
      req.app.locals.presence?.markAction?.(req.user.id, 'binder_saved');
    })
  );

  // Sahip: binder'ı siler (üyelikler cascade). Üye: yalnızca paylaşımdan ayrılır.
  router.delete(
    '/:id',
    wrap(async (req, res) => {
      const binderId = validateBinderId(req.params.id);
      await withTransaction(pool, async (client) => {
        const { rowCount } = await client.query(
          'DELETE FROM binders WHERE user_id = $1 AND id = $2',
          [req.user.id, binderId]
        );
        if (rowCount > 0) {
          // Bu binder için bekleyen paylaşımlar artık kabul edilemez
          await client.query(
            `UPDATE binder_shares SET status = 'cancelled', responded_at = now()
              WHERE from_user_id = $1 AND binder_id = $2 AND status = 'pending'`,
            [req.user.id, binderId]
          );
        } else {
          await client.query(
            'DELETE FROM binder_members WHERE user_id = $1 AND binder_id = $2',
            [req.user.id, binderId]
          );
        }
      });
      res.status(204).end();
    })
  );

  // Resim indeksi (key + hash + boyut) — istemci farkı buna göre yükler
  router.get(
    '/:id/images',
    wrap(async (req, res) => {
      const binderId = validateBinderId(req.params.id);
      const access = await resolveAccess(pool, req.user.id, binderId);
      if (!access) return res.json({ images: [] });
      const { ownerId } = access;
      const { rows } = await pool.query(
        'SELECT key, hash, size_bytes FROM images WHERE user_id = $1 AND binder_id = $2',
        [ownerId, binderId]
      );
      res.json({ images: rows.map((r) => ({ key: r.key, hash: r.hash, size: r.size_bytes })) });
    })
  );

  // Seçili resimlerin verisini getir
  router.post(
    '/:id/images/fetch',
    smallJson,
    wrap(async (req, res) => {
      const binderId = validateBinderId(req.params.id);
      const keys = Array.isArray(req.body?.keys) ? req.body.keys : null;
      if (!keys || keys.length === 0 || keys.length > config.limits.maxImagesPerRequest) {
        throw badRequest('INVALID_KEYS', 'keys must be a non-empty array');
      }
      for (const key of keys) {
        if (!IMAGE_KEY_RE.test(String(key))) throw badRequest('INVALID_IMAGE_KEY', `Invalid image key: ${key}`);
      }
      const { ownerId } = await requireAccess(pool, req.user.id, binderId);
      const { rows } = await pool.query(
        `SELECT key, data FROM images
          WHERE user_id = $1 AND binder_id = $2 AND key = ANY($3::text[])`,
        [ownerId, binderId, keys]
      );
      const images = {};
      for (const r of rows) images[r.key] = r.data;
      res.json({ images });
    })
  );

  // Toplu resim yükleme (upsert). Binder satırı yoksa placeholder oluşturur,
  // böylece istemci önce resimleri sonra dokümanı gönderebilir.
  router.put(
    '/:id/images',
    imagesJson,
    wrap(async (req, res) => {
      const binderId = validateBinderId(req.params.id);
      const images = validateImages(req.body);
      const incomingKeys = images.map((i) => i.key);
      const incomingBytes = images.reduce((sum, i) => sum + i.sizeBytes, 0);

      await withTransaction(pool, async (client) => {
        const access = await resolveAccess(client, req.user.id, binderId);
        assertWritable(access);
        let ownerId = access?.ownerId;
        if (!ownerId) {
          ownerId = req.user.id;
          await client.query(
            `INSERT INTO binders (user_id, id, name) VALUES ($1, $2, $3)
             ON CONFLICT (user_id, id) DO NOTHING`,
            [ownerId, binderId, 'Binder']
          );
        }

        // Kota (sahibin kotası): mevcut toplam − değiştirilecekler + yeni gelenler
        const [{ rows: totalRows }, { rows: replacedRows }] = await Promise.all([
          client.query(
            'SELECT COALESCE(SUM(size_bytes), 0)::bigint AS total FROM images WHERE user_id = $1',
            [ownerId]
          ),
          client.query(
            `SELECT COALESCE(SUM(size_bytes), 0)::bigint AS total FROM images
              WHERE user_id = $1 AND binder_id = $2 AND key = ANY($3::text[])`,
            [ownerId, binderId, incomingKeys]
          ),
        ]);
        const projected = Number(totalRows[0].total) - Number(replacedRows[0].total) + incomingBytes;
        if (projected > config.maxUserStorageBytes) {
          throw new HttpError(413, 'QUOTA_EXCEEDED', 'Storage quota exceeded');
        }

        for (const img of images) {
          await client.query(
            `INSERT INTO images (user_id, binder_id, key, hash, data, size_bytes, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, now())
             ON CONFLICT (user_id, binder_id, key) DO UPDATE SET
               hash = EXCLUDED.hash,
               data = EXCLUDED.data,
               size_bytes = EXCLUDED.size_bytes,
               updated_at = now()`,
            [ownerId, binderId, img.key, img.hash, img.data, img.sizeBytes]
          );
        }
      });

      res.json({ uploaded: images.length, images: images.map(({ key, hash }) => ({ key, hash })) });
    })
  );

  return router;
}

module.exports = { createBindersRouter, collectImageRefs, validateDoc, validateImages };
