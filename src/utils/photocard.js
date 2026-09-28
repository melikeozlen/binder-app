/**
 * Photocard veri modeli
 *
 * Minimum zorunlu alan: image
 * Diğer her şey opsiyonel — kullanıcı kart eklerken doldurmak zorunda değil.
 *
 * Geriye dönük uyumluluk:
 *  - string URL / data URL
 *  - { url, name } / { image, name }
 *  - __IMAGE_REF__… (persist / cloud)
 */

export const IMAGE_REF_PREFIX = '__IMAGE_REF__';

export const PHOTOCARD_STATUSES = Object.freeze([
  'owned',
  'wishlist',
  'trade',
  'sold',
]);

export const PHOTOCARD_OPTIONAL_FIELDS = Object.freeze([
  'artist',
  'group',
  'member',
  'album',
  'era',
  'version',
  'cardType',
  'status',
  'quantity',
  'notes',
  'tags',
]);

const isImageRef = (value) =>
  typeof value === 'string' && value.startsWith(IMAGE_REF_PREFIX);

const isImageSource = (value) =>
  typeof value === 'string' &&
  (value.startsWith('data:image') ||
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    isImageRef(value));

const nowIso = () => new Date().toISOString();

const newPhotocardId = () =>
  `pc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;

const cleanString = (value) => {
  if (value === undefined || value === null) return undefined;
  const s = String(value).trim();
  return s ? s : undefined;
};

const cleanQuantity = (value) => {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.floor(n);
};

const cleanTags = (value) => {
  if (!value) return undefined;
  const list = Array.isArray(value)
    ? value
    : String(value)
        .split(/[,;]/)
        .map((t) => t.trim())
        .filter(Boolean);
  const unique = [...new Set(list.map((t) => String(t).trim()).filter(Boolean))];
  return unique.length ? unique : undefined;
};

const cleanStatus = (value) => {
  const s = cleanString(value);
  if (!s) return undefined;
  return PHOTOCARD_STATUSES.includes(s) ? s : undefined;
};

/**
 * Ham hücre değerinden yalnızca görsel kaynağını çıkarır
 * (URL, data URL veya __IMAGE_REF__).
 */
export function getPhotocardImage(value) {
  if (!value) return '';
  if (typeof value === 'string') {
    return isImageSource(value) ? value : '';
  }
  if (typeof value === 'object') {
    const img = value.image || value.url || '';
    return typeof img === 'string' && isImageSource(img) ? img : '';
  }
  return '';
}

/** Hücredeki __IMAGE_REF__ anahtarını döner (yoksa null) */
export function getImageRefKey(value) {
  const img = getPhotocardImage(value);
  if (!isImageRef(img)) return null;
  return img.slice(IMAGE_REF_PREFIX.length);
}

export function isPhotocardLike(value) {
  if (!value || typeof value !== 'object') return false;
  return Boolean(getPhotocardImage(value) || value.id);
}

/**
 * Her türlü eski/yeni hücre değerini Photocard şekline getirir.
 * image yoksa null döner.
 */
export function normalizePhotocard(value, { preserveId = true } = {}) {
  if (!value) return null;

  // Düz string URL / data / ref
  if (typeof value === 'string') {
    if (!isImageSource(value)) return null;
    const ts = nowIso();
    return {
      id: newPhotocardId(),
      image: value,
      createdAt: ts,
      updatedAt: ts,
    };
  }

  if (typeof value !== 'object') return null;

  const image = getPhotocardImage(value);
  if (!image) return null;

  const ts = nowIso();
  const id =
    preserveId && typeof value.id === 'string' && value.id.trim()
      ? value.id.trim()
      : newPhotocardId();

  const card = {
    id,
    image,
    createdAt: cleanString(value.createdAt) || ts,
    updatedAt: cleanString(value.updatedAt) || ts,
  };

  for (const field of PHOTOCARD_OPTIONAL_FIELDS) {
    if (field === 'status') {
      const status = cleanStatus(value.status);
      if (status) card.status = status;
      continue;
    }
    if (field === 'quantity') {
      const q = cleanQuantity(value.quantity);
      if (q !== undefined) card.quantity = q;
      continue;
    }
    if (field === 'tags') {
      const tags = cleanTags(value.tags);
      if (tags) card.tags = tags;
      continue;
    }
    const cleaned = cleanString(value[field]);
    if (cleaned) card[field] = cleaned;
  }

  // Legacy { url, name } → notes (boşsa)
  if (!card.notes) {
    const legacyName = cleanString(value.name);
    if (legacyName) card.notes = legacyName;
  }

  return card;
}

/**
 * Yeni photocard oluşturur. Yalnızca image zorunlu.
 * @param {string|object} input - URL veya kısmi alanlar ({ image, ... })
 */
export function createPhotocard(input) {
  const base =
    typeof input === 'string'
      ? { image: input }
      : input && typeof input === 'object'
        ? { ...input, image: input.image || input.url }
        : null;

  if (!base || !getPhotocardImage(base)) {
    throw new Error('PHOTOCARD_IMAGE_REQUIRED');
  }

  const ts = nowIso();
  const card = normalizePhotocard(
    {
      ...base,
      id: base.id || newPhotocardId(),
      createdAt: base.createdAt || ts,
      updatedAt: ts,
    },
    { preserveId: true }
  );

  return card;
}

/** Mevcut kartı günceller (image korunabilir / değiştirilebilir) */
export function updatePhotocard(existing, patch = {}) {
  const current = normalizePhotocard(existing);
  if (!current) {
    return createPhotocard(patch);
  }
  const next = normalizePhotocard(
    {
      ...current,
      ...patch,
      id: current.id,
      image: patch.image || patch.url || current.image,
      createdAt: current.createdAt,
      updatedAt: nowIso(),
    },
    { preserveId: true }
  );
  return next;
}

/**
 * Persist: data URL → IndexedDB ref; photocard meta korunur.
 * @returns {string|object|null} hücreye yazılacak değer
 */
export function toPersistedCellValue(value, imageKey) {
  const card = normalizePhotocard(value);
  if (!card) {
    // Eski düz string ref / URL
    if (typeof value === 'string') return value;
    return value ?? null;
  }

  const img = card.image;
  if (typeof img === 'string' && img.startsWith('data:image') && imageKey) {
    return {
      ...card,
      image: `${IMAGE_REF_PREFIX}${imageKey}`,
      updatedAt: nowIso(),
    };
  }

  // Zaten ref veya http(s) — meta'lı photocard olarak sakla
  return card;
}

/**
 * Load: __IMAGE_REF__ çözülünce image alanını data URL ile doldur; meta kalsın.
 */
export function resolvePersistedCellValue(value, resolvedImageData) {
  if (!resolvedImageData) {
    return normalizePhotocard(value) || value;
  }

  if (typeof value === 'string' && value.startsWith(IMAGE_REF_PREFIX)) {
    return createPhotocard({ image: resolvedImageData });
  }

  const card = normalizePhotocard(value);
  if (!card) return resolvedImageData;

  return {
    ...card,
    image: resolvedImageData,
    updatedAt: card.updatedAt || nowIso(),
  };
}

/** UI'da gösterilecek kısa etiket */
export function getPhotocardLabel(value) {
  const card = normalizePhotocard(value);
  if (!card) return '';
  return (
    cleanString(card.member) ||
    cleanString(card.album) ||
    cleanString(card.notes) ||
    cleanString(card.group) ||
    cleanString(card.artist) ||
    ''
  );
}

/** Sayfa content map'indeki tüm hücreleri normalize et (lazy migrate) */
export function normalizePageCells(sideContent) {
  if (!sideContent || typeof sideContent !== 'object') return {};
  const next = {};
  for (const [key, value] of Object.entries(sideContent)) {
    if (value === null || value === undefined) continue;
    const card = normalizePhotocard(value);
    next[key] = card || value;
  }
  return next;
}
