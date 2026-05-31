import { parseGalleryText } from './galleryParse';

// Default gallery dosyalarını yükle
export const loadDefaultGallery = async (filename = 'cortis-pc.txt') => {
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
};

// Tüm default gallery dosyalarını listele
export const getDefaultGalleryFiles = () => {
  return ['cortis-pc.txt'];
};
