// Tarayıcı başına anonim, kalıcı kimlik (istatistik: online sayısı / tekil ziyaretçi).
// Kişisel veri içermez; hesaplar arası paylaşılır (aynı tarayıcı = aynı kimlik).
const STORAGE_KEY = 'binder-client-id';

let cached = null;

function generate() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '');
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}${Math.random()
    .toString(36)
    .slice(2, 12)}`;
}

export function getClientId() {
  if (cached) return cached;
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing && /^[A-Za-z0-9_-]{8,64}$/.test(existing)) {
      cached = existing;
      return cached;
    }
    cached = generate();
    localStorage.setItem(STORAGE_KEY, cached);
  } catch {
    cached = cached || generate();
  }
  return cached;
}
