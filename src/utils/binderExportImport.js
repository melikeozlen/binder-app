import {
  loadImageFromIndexedDB,
  saveImageToIndexedDB,
  saveDefaultBackImageToIndexedDB,
  loadDefaultBackImageFromIndexedDB,
  removeDefaultBackImageFromIndexedDB,
  getAllImagesForBinder,
} from './indexedDB.js';

export const EXPORT_VERSION = 1;
export const EXPORT_FORMAT = 'binder-app-export';

export const getBinderKeyPrefix = (binderId) => `binder-${binderId}-`;

const PAGE_FIELDS = [
  'id',
  'cover',
  'isCover',
  'gridSize',
  'content',
  'backContent',
  'rotatedImages',
  'sleeves',
  'transparent',
  'order',
];

const sortPagesByOrder = (pages) =>
  [...pages].sort((a, b) => {
    const orderA = a.order !== undefined ? a.order : a.id;
    const orderB = b.order !== undefined ? b.order : b.id;
    return orderA - orderB;
  });

const getCellImageDataUrl = (value) => {
  if (!value) return null;
  if (typeof value === 'string') {
    if (value.startsWith('__IMAGE_REF__')) return null;
    if (value.startsWith('data:image')) return value;
    return null;
  }
  if (typeof value === 'object') {
    const url = value.url || value.image;
    if (url && typeof url === 'string' && url.startsWith('data:image')) {
      return url;
    }
  }
  return null;
};

const collectImageRefsFromPages = (pages) => {
  const keys = new Set();
  for (const page of pages) {
    for (const value of [
      ...Object.values(page.content || {}),
      ...Object.values(page.backContent || {}),
    ]) {
      if (typeof value === 'string' && value.startsWith('__IMAGE_REF__')) {
        keys.add(value.replace('__IMAGE_REF__', ''));
      }
      if (typeof value === 'object' && value?.url?.startsWith('__IMAGE_REF__')) {
        keys.add(value.url.replace('__IMAGE_REF__', ''));
      }
    }
  }
  return keys;
};

const normalizePageCellsForExport = (page, images) => {
  const normalizeSide = (sideContent, sideName) => {
    const next = { ...(sideContent || {}) };
    for (const [cellKey, value] of Object.entries(next)) {
      const dataUrl = getCellImageDataUrl(value);
      if (!dataUrl) continue;

      const imageKey = `${page.id}-${sideName}-${cellKey}`;
      images[imageKey] = dataUrl;
      next[cellKey] = `__IMAGE_REF__${imageKey}`;
    }
    return next;
  };

  return {
    ...page,
    content: normalizeSide(page.content, 'content'),
    backContent: normalizeSide(page.backContent, 'back'),
  };
};

const pickPageFields = (page) => {
  const picked = {};
  for (const field of PAGE_FIELDS) {
    if (page[field] !== undefined) {
      picked[field] = page[field];
    }
  }
  return picked;
};

const loadLegacyLocalStorageImage = (binderId, imageKey) => {
  try {
    const prefix = getBinderKeyPrefix(binderId);
    const key = `${prefix}image-${imageKey}`;
    const data = localStorage.getItem(key);
    if (data && data.startsWith('data:image')) {
      return data;
    }
  } catch {
    // ignore
  }
  return null;
};

const loadLegacyDefaultBackImage = (binderId) => {
  try {
    const key = `${getBinderKeyPrefix(binderId)}default-back-image`;
    const data = localStorage.getItem(key);
    if (data && data.startsWith('data:image')) {
      return data;
    }
  } catch {
    // ignore
  }
  return null;
};

const loadRawBinderPages = (binderId) => {
  const prefix = getBinderKeyPrefix(binderId);
  const listJson = localStorage.getItem(`${prefix}pages-list`);
  if (!listJson) return [];

  let pageIds;
  try {
    pageIds = JSON.parse(listJson);
  } catch {
    return [];
  }

  return pageIds
    .map((id) => {
      const raw = localStorage.getItem(`${prefix}page-${id}`);
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
};

const loadBinderSettings = (binderId) => {
  try {
    const saved = localStorage.getItem(`${getBinderKeyPrefix(binderId)}settings`);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
};

const loadBinderGalleryUrls = (binderId) => {
  try {
    const saved = localStorage.getItem(`${getBinderKeyPrefix(binderId)}gallery-urls`);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'string') {
      return parsed.map((url) => ({ url, name: '' }));
    }
    return parsed;
  } catch {
    return [];
  }
};

const collectExportImages = async (binderId, pages) => {
  const images = await getAllImagesForBinder(binderId);
  const refs = collectImageRefsFromPages(pages);

  for (const imageKey of refs) {
    if (images[imageKey]) continue;

    const fromDb = await loadImageFromIndexedDB(imageKey, binderId);
    if (fromDb) {
      images[imageKey] = fromDb;
      continue;
    }

    const legacy = loadLegacyLocalStorageImage(binderId, imageKey);
    if (legacy) {
      images[imageKey] = legacy;
    }
  }

  return images;
};

export async function buildBinderExportPayload(binderId, binderName) {
  const rawPages = sortPagesByOrder(loadRawBinderPages(binderId));
  const images = await collectExportImages(binderId, rawPages);

  const pages = rawPages.map((page) =>
    pickPageFields(normalizePageCellsForExport(page, images))
  );

  const settings = loadBinderSettings(binderId);
  const galleryUrls = loadBinderGalleryUrls(binderId);

  let defaultBackImage = await loadDefaultBackImageFromIndexedDB(binderId);
  if (!defaultBackImage) {
    defaultBackImage = loadLegacyDefaultBackImage(binderId);
  }

  const missingRefs = [];
  for (const page of pages) {
    for (const value of [
      ...Object.values(page.content || {}),
      ...Object.values(page.backContent || {}),
    ]) {
      if (typeof value === 'string' && value.startsWith('__IMAGE_REF__')) {
        const imageKey = value.replace('__IMAGE_REF__', '');
        if (!images[imageKey]) {
          missingRefs.push(imageKey);
        }
      }
    }
  }

  if (missingRefs.length > 0) {
    console.warn(
      `Export: ${missingRefs.length} resim referansı için veri bulunamadı`,
      missingRefs
    );
  }

  return {
    version: EXPORT_VERSION,
    format: EXPORT_FORMAT,
    exportedAt: Date.now(),
    binder: {
      name: binderName || 'Binder',
      settings: settings || {},
      galleryUrls,
      defaultBackImage: defaultBackImage || null,
      pageIds: pages.map((p) => p.id),
      pages,
      images,
    },
  };
}

export function downloadBinderExport(payload, binderName) {
  const safeName = (binderName || 'binder')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-') || 'binder';

  const json = JSON.stringify(payload);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${safeName}.binder.json`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export async function exportBinderToFile(binderId, binderName) {
  const payload = await buildBinderExportPayload(binderId, binderName);
  downloadBinderExport(payload, binderName);
  return payload;
}

export function parseBinderImportFile(text) {
  const data = JSON.parse(text);
  if (!data || data.format !== EXPORT_FORMAT) {
    throw new Error('INVALID_FORMAT');
  }
  if (!data.binder || !Array.isArray(data.binder.pages)) {
    throw new Error('INVALID_DATA');
  }
  return data;
}

export async function applyBinderImport(data, newBinderId) {
  const { binder } = data;
  const prefix = getBinderKeyPrefix(newBinderId);

  if (binder.settings) {
    localStorage.setItem(`${prefix}settings`, JSON.stringify(binder.settings));
  }

  localStorage.setItem(
    `${prefix}gallery-urls`,
    JSON.stringify(binder.galleryUrls || [])
  );

  if (binder.defaultBackImage) {
    await saveDefaultBackImageToIndexedDB(binder.defaultBackImage, newBinderId);
  } else {
    await removeDefaultBackImageFromIndexedDB(newBinderId);
  }

  const images = binder.images || {};
  for (const [imageKey, imageData] of Object.entries(images)) {
    if (imageData && typeof imageData === 'string') {
      await saveImageToIndexedDB(imageKey, imageData, newBinderId);
    }
  }

  const sortedPages = sortPagesByOrder(binder.pages).map(pickPageFields);
  const pageIds =
    Array.isArray(binder.pageIds) && binder.pageIds.length > 0
      ? binder.pageIds
      : sortedPages.map((p) => p.id);

  const orderedPages = pageIds
    .map((id) => sortedPages.find((p) => p.id === id))
    .filter(Boolean);

  const pagesToSave = orderedPages.length > 0 ? orderedPages : sortedPages;
  const finalPageIds = pagesToSave.map((p) => p.id);

  for (const page of pagesToSave) {
    localStorage.setItem(`${prefix}page-${page.id}`, JSON.stringify(page));
  }
  localStorage.setItem(`${prefix}pages-list`, JSON.stringify(finalPageIds));

  return {
    name: binder.name || 'Imported Binder',
    pageCount: finalPageIds.length,
    imageCount: Object.keys(images).length,
  };
}
