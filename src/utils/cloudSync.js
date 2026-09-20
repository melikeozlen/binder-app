// Bulut eşitleme mantığı (React'tan bağımsız).
//
// Model:
//  - Yerel veri (localStorage + IndexedDB) her zaman "çalışma kopyası"dır (misafir modu aynen çalışır).
//  - Bulut kaydı OPT-IN'dir: yerel bir binder ancak kullanıcı "Kaydet" dediğinde hesaba yüklenir.
//    Kaydedilen binder (bu kullanıcı için geçerli cloud-meta'sı olan) sonrasında otomatik eşitlenir.
//  - Bulutta kayıtlı her binder için bir doküman (ayarlar + sayfalar) ve resimler tutulur.
//  - Değişiklik tespiti hash tabanlıdır: yerel snapshot hash'i, son push/pull'da kaydedilen
//    meta.hash ile aynıysa push atlanır. Bulut tarafı için updatedAt karşılaştırılır.
//  - Çakışmada (hem yerel hem bulut değişmiş) veri kaybı olmaz: bulut sürümü ayrı bir
//    binder kopyası olarak alınır, yerel sürüm push edilir.

import { api, encodeId } from './apiClient';
import { fnv1a, stableStringify } from './contentHash';
import {
  buildBinderExportPayload,
  applyBinderImport,
  getBinderKeyPrefix,
} from './binderExportImport';
import {
  removeAllImagesForBinder,
  removeDefaultBackImageFromIndexedDB,
} from './indexedDB';

const META_SUFFIX = 'cloud-meta';
const IMAGE_REF_PREFIX = '__IMAGE_REF__';
const UPLOAD_CHUNK_BYTES = 6 * 1024 * 1024;
const UPLOAD_CHUNK_COUNT = 100;
const FETCH_CHUNK_KEYS = 50;

/* ------------------------------------------------------------------ */
/* Meta (binder başına son eşitleme bilgisi)                           */
/* ------------------------------------------------------------------ */

export const cloudMetaKey = (binderId) => `${getBinderKeyPrefix(binderId)}${META_SUFFIX}`;

export function loadCloudMeta(binderId) {
  try {
    const raw = localStorage.getItem(cloudMetaKey(binderId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function saveCloudMeta(binderId, meta) {
  try {
    localStorage.setItem(cloudMetaKey(binderId), JSON.stringify(meta));
  } catch (error) {
    console.warn('Cloud meta kaydedilemedi:', error);
  }
}

export function removeCloudMeta(binderId) {
  try {
    localStorage.removeItem(cloudMetaKey(binderId));
  } catch {
    // ignore
  }
}

// Binder bu kullanıcının hesabına kaydedilmiş mi? (otomatik eşitleme yalnızca bunlar için)
export function isCloudBinder(binderId, userId) {
  const meta = loadCloudMeta(binderId);
  return Boolean(meta && userId && meta.userId === userId);
}

/* ------------------------------------------------------------------ */
/* Yardımcılar                                                         */
/* ------------------------------------------------------------------ */

export function collectImageRefs(pages) {
  const keys = new Set();
  for (const page of pages || []) {
    for (const side of [page?.content, page?.backContent]) {
      if (!side || typeof side !== 'object') continue;
      for (const value of Object.values(side)) {
        if (typeof value === 'string' && value.startsWith(IMAGE_REF_PREFIX)) {
          keys.add(value.slice(IMAGE_REF_PREFIX.length));
        } else if (
          value &&
          typeof value === 'object' &&
          typeof value.url === 'string' &&
          value.url.startsWith(IMAGE_REF_PREFIX)
        ) {
          keys.add(value.url.slice(IMAGE_REF_PREFIX.length));
        }
      }
    }
  }
  return keys;
}

export function hasLocalPages(binderId) {
  try {
    const raw = localStorage.getItem(`${getBinderKeyPrefix(binderId)}pages-list`);
    if (!raw) return false;
    const list = JSON.parse(raw);
    return Array.isArray(list) && list.length > 0;
  } catch {
    return false;
  }
}

function* chunkImages(keys, images) {
  let chunk = {};
  let bytes = 0;
  let count = 0;
  for (const key of keys) {
    const data = images[key];
    if (count > 0 && (bytes + data.length > UPLOAD_CHUNK_BYTES || count >= UPLOAD_CHUNK_COUNT)) {
      yield chunk;
      chunk = {};
      bytes = 0;
      count = 0;
    }
    chunk[key] = data;
    bytes += data.length;
    count += 1;
  }
  if (count > 0) yield chunk;
}

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function removeLocalKeysWithPrefix(prefix) {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix)) keys.push(key);
  }
  keys.forEach((key) => localStorage.removeItem(key));
}

// Sayfalar + hücre resimleri (ayarlar import ile üzerine yazılır)
async function clearLocalPagesAndImages(binderId) {
  const prefix = getBinderKeyPrefix(binderId);
  removeLocalKeysWithPrefix(`${prefix}page-`);
  localStorage.removeItem(`${prefix}pages-list`);
  await removeAllImagesForBinder(binderId);
}

// Binder'ın tüm yerel verisi (liste kaydı hariç — onu çağıran günceller)
export async function clearLocalBinderCompletely(binderId) {
  removeLocalKeysWithPrefix(getBinderKeyPrefix(binderId));
  try {
    await removeAllImagesForBinder(binderId);
    await removeDefaultBackImageFromIndexedDB(binderId);
  } catch (error) {
    console.warn('IndexedDB temizlenemedi:', error);
  }
}

/* ------------------------------------------------------------------ */
/* Snapshot                                                            */
/* ------------------------------------------------------------------ */

// Yerel binder'ın bulut dokümanı + resimleri + içerik hash'i
export async function buildLocalSnapshot(binderId, name) {
  const payload = await buildBinderExportPayload(binderId, name);
  const binder = payload.binder;
  const refs = collectImageRefs(binder.pages);

  const images = {};
  const imageHashes = {};
  for (const key of refs) {
    const data = binder.images?.[key];
    if (typeof data === 'string' && data.startsWith('data:image')) {
      images[key] = data;
      imageHashes[key] = fnv1a(data);
    }
  }

  const doc = {
    name: binder.name,
    settings: binder.settings || {},
    galleryUrls: binder.galleryUrls || [],
    pageIds: binder.pageIds || [],
    pages: binder.pages || [],
    defaultBackImage: binder.defaultBackImage || null,
  };

  const hash = fnv1a(stableStringify({ doc, imageHashes }));
  return { doc, images, imageHashes, hash };
}

/* ------------------------------------------------------------------ */
/* Push / Pull / Delete                                                */
/* ------------------------------------------------------------------ */

export async function pushBinder(binderId, { name, createdAt, userId }, { force = false } = {}) {
  const snapshot = await buildLocalSnapshot(binderId, name);
  const meta = loadCloudMeta(binderId);

  if (!force && meta && meta.userId === userId && meta.updatedAt && meta.hash === snapshot.hash) {
    return { skipped: true, meta };
  }

  // 1) Resimler: yalnızca bulutta olmayan/değişmiş olanlar
  const remoteIndex = await api(`/api/binders/${encodeId(binderId)}/images`);
  const remoteHashes = new Map((remoteIndex?.images || []).map((img) => [img.key, img.hash]));
  const toUpload = Object.keys(snapshot.images).filter(
    (key) => remoteHashes.get(key) !== snapshot.imageHashes[key]
  );
  for (const chunk of chunkImages(toUpload, snapshot.images)) {
    await api(`/api/binders/${encodeId(binderId)}/images`, { method: 'PUT', body: { images: chunk } });
  }

  // 2) Doküman (sunucu referanssız resimleri temizler)
  const result = await api(`/api/binders/${encodeId(binderId)}`, {
    method: 'PUT',
    body: { ...snapshot.doc, createdAt: createdAt || Date.now() },
  });

  const newMeta = { userId, hash: snapshot.hash, updatedAt: result.updatedAt, syncedAt: Date.now() };
  saveCloudMeta(binderId, newMeta);
  return { skipped: false, meta: newMeta, uploadedImages: toUpload.length };
}

// Bulut dokümanını yerel `localId` binder'ına yazar (varsayılan: aynı id)
export async function pullBinder(remoteId, userId, localId = remoteId) {
  const doc = await api(`/api/binders/${encodeId(remoteId)}`);
  const index = await api(`/api/binders/${encodeId(remoteId)}/images`);
  const keys = (index?.images || []).map((img) => img.key);

  const images = {};
  for (const chunk of chunkArray(keys, FETCH_CHUNK_KEYS)) {
    const result = await api(`/api/binders/${encodeId(remoteId)}/images/fetch`, {
      method: 'POST',
      body: { keys: chunk },
    });
    Object.assign(images, result?.images || {});
  }

  await clearLocalPagesAndImages(localId);
  await applyBinderImport(
    {
      binder: {
        name: doc.name,
        settings: doc.settings || {},
        galleryUrls: doc.galleryUrls || [],
        defaultBackImage: doc.defaultBackImage || null,
        pageIds: doc.pageIds || [],
        pages: doc.pages || [],
        images,
      },
    },
    localId
  );

  if (localId === remoteId) {
    // Hash'i yerelden yeniden hesapla (JSONB anahtar sırası vb. farklar için)
    const snapshot = await buildLocalSnapshot(localId, doc.name);
    saveCloudMeta(localId, { userId, hash: snapshot.hash, updatedAt: doc.updatedAt, syncedAt: Date.now() });
  } else {
    removeCloudMeta(localId);
  }

  return {
    id: localId,
    name: doc.name,
    createdAt: doc.createdAt || Date.now(),
    // Kopya (localId !== remoteId) her zaman kullanıcının kendi binder'ı olur
    ...(localId === remoteId ? sharingFields(doc) : sharingFields({})),
  };
}

// Paylaşılan binder'daki yetkim: 'edit' | 'view' (kendi binder'ım → null)
const memberRole = (remote) => (remote.shared ? (remote.role === 'view' ? 'view' : 'edit') : null);

// Liste kaydındaki paylaşım alanları buluttakinden farklı mı?
function sharingChanged(local, remote) {
  const localShared = Boolean(local.shared);
  const remoteShared = Boolean(remote.shared);
  if (localShared !== remoteShared) return true;
  if (!remoteShared) return false;
  return (
    (local.ownerUsername || null) !== (remote.ownerUsername || null) ||
    (local.role || 'edit') !== memberRole(remote)
  );
}

const sharingFields = (remote) => ({
  shared: Boolean(remote.shared),
  ownerUsername: remote.shared ? remote.ownerUsername || null : null,
  role: memberRole(remote),
});

/** Bu binder'da yalnızca görüntüleme yetkim var mı? */
export const isViewOnlyBinder = (binder) => Boolean(binder?.shared && binder.role === 'view');

export async function deleteCloudBinder(binderId) {
  try {
    await api(`/api/binders/${encodeId(binderId)}`, { method: 'DELETE' });
  } catch (error) {
    if (error?.status !== 404) throw error;
  } finally {
    removeCloudMeta(binderId);
  }
}

/* ------------------------------------------------------------------ */
/* Reconcile (giriş + periyodik)                                       */
/* ------------------------------------------------------------------ */

/**
 * Yerel liste ile bulut listesini uzlaştırır.
 * @param {object} p
 * @param {string} p.userId
 * @param {Array<{id:string,name:string,createdAt:number}>} p.localBinders
 * @param {boolean} p.checkLocalChanges  Girişte true: tüm yerel binder'lar için hash hesapla
 * @param {string} p.copySuffix          Çakışma kopyası adı eki
 * @returns {{added:Array, updated:Array, removed:string[], pulled:string[], pushed:string[], conflicts:Array}}
 *   updated: [{ id, ...değişen liste alanları (name / shared / ownerUsername) }]
 */
export async function reconcile({ userId, localBinders, checkLocalChanges = false, copySuffix = ' (cloud copy)' }) {
  const remoteList = (await api('/api/binders'))?.binders || [];
  const remoteById = new Map(remoteList.map((b) => [b.id, b]));
  const result = { added: [], updated: [], removed: [], pulled: [], pushed: [], conflicts: [] };

  // Buluttaki binder'lar (kendi + benimle paylaşılanlar)
  for (const remote of remoteList) {
    const local = localBinders.find((b) => b.id === remote.id);

    if (!local) {
      const info = await pullBinder(remote.id, userId);
      result.added.push({ ...info, ...sharingFields(remote) });
      result.pulled.push(remote.id);
      continue;
    }

    // Paylaşım bilgisi (sahip / üye / yetki) liste kaydında güncel dursun
    const listPatch = sharingChanged(local, remote) ? sharingFields(remote) : null;

    const meta = loadCloudMeta(remote.id);
    const metaValid = Boolean(meta && meta.userId === userId);
    const remoteChanged = !metaValid || meta.updatedAt !== remote.updatedAt;

    // Sadece görüntüleme: asla push yok; bulut her zaman kazanır (yerel sapma varsa geri çekilir)
    if (memberRole(remote) === 'view') {
      let needPull = remoteChanged;
      if (!needPull && checkLocalChanges) {
        const snapshot = await buildLocalSnapshot(remote.id, local.name);
        needPull = snapshot.hash !== meta.hash;
      }
      if (needPull) {
        const info = await pullBinder(remote.id, userId);
        result.pulled.push(remote.id);
        const patch = { ...(listPatch || {}) };
        if (info.name !== local.name) patch.name = info.name;
        if (Object.keys(patch).length > 0) result.updated.push({ id: remote.id, ...patch });
      } else if (listPatch) {
        result.updated.push({ id: remote.id, ...listPatch });
      }
      continue;
    }

    if (!remoteChanged) {
      if (checkLocalChanges) {
        const res = await pushBinder(remote.id, { ...local, userId });
        if (!res.skipped) result.pushed.push(remote.id);
      }
      if (listPatch) result.updated.push({ id: remote.id, ...listPatch });
      continue;
    }

    const snapshot = await buildLocalSnapshot(remote.id, local.name);
    const localChanged = !metaValid || snapshot.hash !== meta.hash;

    if (!localChanged) {
      const info = await pullBinder(remote.id, userId);
      result.pulled.push(remote.id);
      const patch = { ...(listPatch || {}) };
      if (info.name !== local.name) patch.name = info.name;
      if (Object.keys(patch).length > 0) result.updated.push({ id: remote.id, ...patch });
      continue;
    }

    // Çakışma: bulut sürümünü kopya olarak al, yereli push et
    const copyId = `binder-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const copy = await pullBinder(remote.id, userId, copyId);
    const copyName = `${copy.name}${copySuffix}`;
    result.added.push({ id: copyId, name: copyName, createdAt: Date.now() });
    result.conflicts.push({ id: remote.id, copyId });
    await pushBinder(remote.id, { ...local, userId }, { force: true });
    result.pushed.push(remote.id);
    if (listPatch) result.updated.push({ id: remote.id, ...listPatch });
    // Kopyayı da buluta al (kullanıcının kendi hesabına)
    await pushBinder(copyId, { name: copyName, createdAt: Date.now(), userId }, { force: true });
    result.pushed.push(copyId);
  }

  // Yerelde olup bulutta olmayanlar
  const cloudHasData = remoteList.length > 0;
  for (const local of localBinders) {
    if (remoteById.has(local.id)) continue;
    const meta = loadCloudMeta(local.id);
    const metaValid = Boolean(meta && meta.userId === userId);

    // Benimle paylaşılan binder artık listede yok → sahip sildi / erişimi kaldırdı / ayrıldım.
    // Bu binder bize ait değil; asla kendi hesabımıza push etme, yereli temizle.
    if (local.shared && metaValid) {
      await clearLocalBinderCompletely(local.id);
      result.removed.push(local.id);
      continue;
    }

    if (metaValid) {
      // Daha önce bu hesaba kaydedilmiş ama bulutta yok → başka cihazda silinmiş.
      if (cloudHasData) {
        await clearLocalBinderCompletely(local.id);
        result.removed.push(local.id);
        continue;
      }
      // Bulut tamamen boş → DB sıfırlanmış olabilir; silme yayma, yeniden push.
      await pushBinder(local.id, { ...local, userId }, { force: true });
      result.pushed.push(local.id);
      continue;
    }

    // Yeni cihazdaki otomatik boş "Binder 1" → bulut varken gereksiz
    if (cloudHasData && localBinders.length === 1 && !hasLocalPages(local.id)) {
      await clearLocalBinderCompletely(local.id);
      result.removed.push(local.id);
      continue;
    }

    // Hesaba kaydedilmemiş yerel binder: dokunma (kullanıcı "Kaydet" deyince yüklenir)
  }

  return result;
}

/* ------------------------------------------------------------------ */
/* Sıralı iş kuyruğu (push/pull çakışmasın)                            */
/* ------------------------------------------------------------------ */

export function createSyncQueue() {
  let tail = Promise.resolve();
  let pending = 0;
  return {
    enqueue(task) {
      pending += 1;
      const run = tail.then(task, task).finally(() => {
        pending -= 1;
      });
      // Zincir kırılmasın
      tail = run.catch(() => {});
      return run;
    },
    get size() {
      return pending;
    },
  };
}
