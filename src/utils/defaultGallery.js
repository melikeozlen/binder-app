import { parseGalleryText } from './galleryParse';

const galleryCache = new Map();

// Default gallery dosyalarını yükle (bellek önbelleği — tekrar fetch/parse yok)
export const loadDefaultGallery = async (filename = 'cortis-pc.txt') => {
  if (galleryCache.has(filename)) {
    return galleryCache.get(filename);
  }

  const loadPromise = (async () => {
    try {
      const response = await fetch(`/data/${filename}`);
      if (!response.ok) {
        console.error(`Default gallery dosyası yüklenemedi: ${filename}`);
        return [];
      }

      const text = await response.text();
      return parseGalleryText(text);
    } catch (error) {
      console.error(`Default gallery yüklenirken hata (${filename}):`, error);
      return [];
    }
  })();

  galleryCache.set(filename, loadPromise);
  return loadPromise;
};

// Tüm default gallery dosyalarını listele
export const getDefaultGalleryFiles = () => {
  return ['cortis-pc.txt'];
};
