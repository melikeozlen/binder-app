// Default gallery dosyalarını yükle
export const loadDefaultGallery = async (filename = 'cortis-pc.txt') => {
  try {
    const response = await fetch(`/data/${filename}`);
    if (!response.ok) {
      console.error(`Default gallery dosyası yüklenemedi: ${filename}`);
      return [];
    }
    
    const text = await response.text();
    // Her satırı parse et: URL | Resim Adı formatı
    const items = text.split('\n')
      .map(line => line.trim())
      .filter(line => {
        // Boş satırları filtrele ve URL kontrolü yap
        if (!line) return false;
        // URL | Name formatında veya sadece URL olabilir
        const urlPart = line.split('|')[0].trim();
        return urlPart && (urlPart.startsWith('http://') || urlPart.startsWith('https://'));
      })
      .map(line => {
        const parts = line.split('|').map(p => p.trim());
        const url = parts[0].trim();
        const name = parts.slice(1).join('|').trim(); // Birden fazla | varsa birleştir
        return { url, name };
      });
    
    return items;
  } catch (error) {
    console.error(`Default gallery yüklenirken hata (${filename}):`, error);
    return [];
  }
};

// Tüm default gallery dosyalarını listele
export const getDefaultGalleryFiles = () => {
  // Şimdilik sadece cortis-pc.txt var, ileride daha fazla eklenebilir
  return ['cortis-pc.txt'];
};

