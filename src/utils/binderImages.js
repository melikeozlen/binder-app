import {
  getPhotocardImage,
  getPhotocardLabel,
  getImageRefKey,
  normalizePhotocard,
  IMAGE_REF_PREFIX,
} from './photocard';

/** @deprecated tercih: getPhotocardImage / getPhotocardLabel */
export const extractImageFromCell = (value) => {
  const url = getPhotocardImage(value);
  const name = getPhotocardLabel(value);
  return { url, name };
};

/** Galeri / binder URL karşılaştırması için normalize eder */
export const normalizeImageUrl = (url) => {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';

  if (
    trimmed.startsWith('data:image') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://')
  ) {
    try {
      const parsed = new URL(trimmed);
      parsed.hostname = parsed.hostname.toLowerCase();
      parsed.hash = '';
      return parsed.toString();
    } catch {
      return trimmed;
    }
  }

  return trimmed;
};

export const collectBinderUsedImages = (pages = [], defaultBackImage = null) => {
  const urls = new Set();

  const addUrl = (url) => {
    const normalized = normalizeImageUrl(url);
    if (
      normalized &&
      (normalized.startsWith('http://') ||
        normalized.startsWith('https://') ||
        normalized.startsWith('data:image'))
    ) {
      urls.add(normalized);
    }
  };

  pages.forEach((page) => {
    Object.values(page.content || {}).forEach((value) => {
      addUrl(getPhotocardImage(value));
    });
    Object.values(page.backContent || {}).forEach((value) => {
      addUrl(getPhotocardImage(value));
    });
  });

  if (defaultBackImage) {
    addUrl(getPhotocardImage(defaultBackImage));
  }

  return { urls };
};

export const isGalleryItemInBinder = (item, usedImages) => {
  if (!usedImages?.urls) return false;

  const url = typeof item === 'string' ? item : item?.url || item?.image;
  const normalized = normalizeImageUrl(url);
  if (!normalized) return false;

  return usedImages.urls.has(normalized);
};

/** Hücreden image-ref key topla (string veya photocard.image) */
export const collectImageRefKeysFromValue = (value, into = new Set()) => {
  const key = getImageRefKey(value);
  if (key) into.add(key);
  return into;
};

export { getPhotocardImage, getPhotocardLabel, getImageRefKey, normalizePhotocard, IMAGE_REF_PREFIX };
