export const extractImageFromCell = (value) => {
  if (!value) return { url: '', name: '' };
  if (typeof value === 'string') {
    if (
      value.startsWith('data:image') ||
      value.startsWith('http://') ||
      value.startsWith('https://')
    ) {
      return { url: value, name: '' };
    }
    return { url: '', name: '' };
  }
  if (typeof value === 'object') {
    const url = value.url || value.image || '';
    const name = (value.name || '').trim();
    return { url, name };
  }
  return { url: '', name: '' };
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
      addUrl(extractImageFromCell(value).url);
    });
    Object.values(page.backContent || {}).forEach((value) => {
      addUrl(extractImageFromCell(value).url);
    });
  });

  if (defaultBackImage) {
    addUrl(extractImageFromCell(defaultBackImage).url);
  }

  return { urls };
};

export const isGalleryItemInBinder = (item, usedImages) => {
  if (!usedImages?.urls) return false;

  const url = typeof item === 'string' ? item : item?.url;
  const normalized = normalizeImageUrl(url);
  if (!normalized) return false;

  return usedImages.urls.has(normalized);
};
