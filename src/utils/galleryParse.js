export const GALLERY_ALL_KEY = '__ALL__';

const isUrl = (str) =>
  typeof str === 'string' &&
  (str.startsWith('http://') || str.startsWith('https://'));

/** Tek satırı parse eder: Dosya | URL | Başlık veya eski URL | Başlık */
export const parseGalleryLine = (line) => {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const parts = trimmed.split('|').map((p) => p.trim());

  if (isUrl(parts[0])) {
    return { file: null, url: parts[0], name: parts.slice(1).join('|').trim() };
  }

  const urlIndex = parts.findIndex(isUrl);
  if (urlIndex === -1) return null;

  if (urlIndex === 0) {
    return { file: null, url: parts[0], name: parts.slice(1).join('|').trim() };
  }

  const file = parts.slice(0, urlIndex).join('|').trim() || null;
  const url = parts[urlIndex];
  const name = parts.slice(urlIndex + 1).join('|').trim();
  return { file, url, name };
};

/** Metin içeriğinden galeri öğelerini çıkarır */
export const parseGalleryText = (text) => {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseGalleryLine)
    .filter((item) => item && item.url);
};

export const getItemFileLabel = (item, untitledLabel) => {
  if (!item || typeof item === 'string') return untitledLabel;
  const file = item.file?.trim();
  return file || untitledLabel;
};

/** Klasör adına göre grupla */
export const groupGalleryByFile = (items, untitledLabel) => {
  const groups = {};
  items.forEach((item) => {
    const label = getItemFileLabel(item, untitledLabel);
    if (!groups[label]) groups[label] = [];
    groups[label].push(item);
  });
  return groups;
};

/** Klasör listesi: { name, count } — alfabetik */
export const getGalleryFolderList = (items, untitledLabel) => {
  const groups = groupGalleryByFile(items, untitledLabel);
  return Object.keys(groups)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    .map((name) => ({ name, count: groups[name].length }));
};

export const truncateGalleryName = (name, maxLength = 15) => {
  if (!name) return '';
  if (name.length <= maxLength) return name;
  return `${name.substring(0, maxLength)}...`;
};

/** Boşlukla ayrılmış kelimelerin hepsinin metinde geçip geçmediğini kontrol eder */
export const matchesGallerySearch = (text, searchTerm) => {
  const query = (searchTerm || '').trim().toLowerCase();
  if (!query) return true;

  const haystack = (text || '').toLowerCase();
  const tokens = query.split(/\s+/).filter(Boolean);
  return tokens.every((token) => haystack.includes(token));
};
