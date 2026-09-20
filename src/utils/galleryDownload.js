import { driveProxyUrl, extractDriveFileId } from './driveImageUrl';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

const EXT_FROM_TYPE = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg',
};

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(n) {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, n, true);
  return b;
}

function u32(n) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, true);
  return b;
}

function encodeUtf8(str) {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(str);
  }
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i += 1) {
    out[i] = str.charCodeAt(i) & 0xff;
  }
  return out;
}

function concatBytes(parts) {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** Sıkıştırmasız (store) ZIP oluşturur */
export function buildStoreZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encodeUtf8(file.name);
    const data = file.data instanceof Uint8Array ? file.data : new Uint8Array(file.data);
    const crc = crc32(data);
    const size = data.length;

    const localHeader = concatBytes([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(size),
      u32(size),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
    ]);

    localParts.push(localHeader, data);

    const centralHeader = concatBytes([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(size),
      u32(size),
      u16(nameBytes.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBytes,
    ]);
    centralParts.push(centralHeader);
    offset += localHeader.length + data.length;
  }

  const central = concatBytes(centralParts);
  const end = concatBytes([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(central.length),
    u32(offset),
    u16(0),
  ]);

  return new Blob([concatBytes([...localParts, central, end])], { type: 'application/zip' });
}

export function sanitizeFilename(name, fallback = 'image') {
  const cleaned = String(name || '')
    .replace(/[<>:"/\\|?*]/g, '_')
    .split('')
    .map((ch) => (ch.charCodeAt(0) < 32 ? '_' : ch))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return cleaned || fallback;
}

function extensionFromUrl(url) {
  try {
    const path = new URL(url, window.location.href).pathname;
    const match = path.match(/\.([a-zA-Z0-9]{2,5})$/);
    if (match) return match[1].toLowerCase();
  } catch {
    // ignore
  }
  return null;
}

function extensionFromType(type) {
  if (!type) return null;
  const base = type.split(';')[0].trim().toLowerCase();
  return EXT_FROM_TYPE[base] || null;
}

/** Harici URL → aynı-origin image-proxy (CORS yok) */
export function externalImageProxyUrl(url) {
  return `/api/image-proxy?url=${encodeURIComponent(url)}`;
}

/** İndirme için aday URL'ler — mümkünse her zaman aynı-origin proxy */
export function downloadUrlCandidates(url) {
  if (!url || typeof url !== 'string') return [];
  if (url.startsWith('data:') || url.startsWith('blob:')) return [url];

  const fileId = extractDriveFileId(url);
  if (fileId) {
    return [driveProxyUrl(fileId)];
  }

  // Aynı origin (public/ vs.) doğrudan; dışarıdakiler proxy
  try {
    if (typeof window !== 'undefined') {
      const absolute = new URL(url, window.location.href);
      if (absolute.origin === window.location.origin) {
        return [absolute.pathname + absolute.search];
      }
    }
  } catch {
    // ignore
  }

  return [externalImageProxyUrl(url)];
}

export async function fetchImageBlob(url) {
  if (url.startsWith('data:')) {
    const response = await fetch(url);
    return response.blob();
  }
  if (url.startsWith('blob:')) {
    const response = await fetch(url);
    return response.blob();
  }

  const candidates = downloadUrlCandidates(url);
  let lastError = null;

  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate, {
        mode: 'same-origin',
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!response.ok) {
        lastError = new Error(`HTTP ${response.status}`);
        continue;
      }
      const blob = await response.blob();
      if (!blob || blob.size === 0) {
        lastError = new Error('Empty body');
        continue;
      }
      if (blob.type && blob.type.includes('text/html')) {
        lastError = new Error('Not an image');
        continue;
      }
      return blob;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('DOWNLOAD_FAILED');
}

export function triggerBlobDownload(blob, filename) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
}

/** Aynı-origin URL için doğrudan indirme (fetch/blob gerekmez) */
export function triggerUrlDownload(url, filename) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename || 'image.jpg';
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function guessFilename(item, index, blob) {
  const base = sanitizeFilename(item?.name || `image-${index + 1}`, `image-${index + 1}`);
  const hasExt = /\.[a-zA-Z0-9]{2,5}$/.test(base);
  if (hasExt) return base;
  const ext =
    (blob && extensionFromType(blob.type)) ||
    extensionFromUrl(item?.url) ||
    'jpg';
  return `${base}.${ext}`;
}

/**
 * Görüntüdeki <img> öğesinden (zaten yüklenmiş) blob üretmeyi dener.
 * cross-origin tainted canvas olursa null döner.
 */
export async function blobFromImageElement(img) {
  if (!img || !img.naturalWidth) return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    const blob = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92);
    });
    return blob || null;
  } catch {
    return null;
  }
}

/** Tek galeri resmini indir */
export async function downloadGalleryImage(item, index = 0, imgEl = null) {
  const url = typeof item === 'string' ? item : item?.url;
  if (!url) throw new Error('NO_URL');
  const meta = typeof item === 'string' ? { url, name: '' } : item;

  // 1) Drive → aynı-origin proxy (en güvenilir)
  const fileId = extractDriveFileId(url);
  if (fileId) {
    const name = guessFilename(meta, index, null);
    try {
      const blob = await fetchImageBlob(url);
      triggerBlobDownload(blob, guessFilename(meta, index, blob));
      return name;
    } catch {
      // Proxy fetch başarısızsa doğrudan link ile dene
      triggerUrlDownload(driveProxyUrl(fileId), name);
      return name;
    }
  }

  // 2) Zaten ekranda görünen img'den (CORS izin verirse)
  if (imgEl) {
    const fromImg = await blobFromImageElement(imgEl);
    if (fromImg) {
      const name = guessFilename(meta, index, fromImg);
      triggerBlobDownload(fromImg, name);
      return name;
    }
  }

  // 3) fetch
  const blob = await fetchImageBlob(url);
  const name = guessFilename(meta, index, blob);
  triggerBlobDownload(blob, name);
  return name;
}

async function mapPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;

  async function run() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index], index);
    }
  }

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, () => run());
  await Promise.all(runners);
  return results;
}

/**
 * Filtrelenmiş galeri öğelerini ZIP olarak indir.
 * @returns {{ ok: number, failed: number, total: number }}
 */
export async function downloadGalleryZip(items, { zipName = 'gallery', onProgress } = {}) {
  const list = (items || [])
    .map((item, index) => {
      if (typeof item === 'string') return { url: item, name: '', index };
      return { url: item?.url, name: item?.name || '', index };
    })
    .filter((item) => item.url);

  if (list.length === 0) {
    return { ok: 0, failed: 0, total: 0 };
  }

  const usedNames = new Set();
  let done = 0;

  const fetched = await mapPool(list, 4, async (item) => {
    try {
      const blob = await fetchImageBlob(item.url);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let name = guessFilename(item, item.index, blob);
      if (usedNames.has(name)) {
        const dot = name.lastIndexOf('.');
        const stem = dot > 0 ? name.slice(0, dot) : name;
        const ext = dot > 0 ? name.slice(dot) : '';
        let n = 2;
        while (usedNames.has(`${stem}-${n}${ext}`)) n += 1;
        name = `${stem}-${n}${ext}`;
      }
      usedNames.add(name);
      done += 1;
      onProgress?.({ done, total: list.length, ok: true });
      return { name, data: bytes, ok: true };
    } catch {
      done += 1;
      onProgress?.({ done, total: list.length, ok: false });
      return { ok: false };
    }
  });

  const files = fetched.filter((f) => f.ok).map(({ name, data }) => ({ name, data }));
  const failed = list.length - files.length;

  if (files.length === 0) {
    return { ok: 0, failed, total: list.length };
  }

  const zipBlob = buildStoreZip(files);
  const safeZip = `${sanitizeFilename(zipName, 'gallery')}.zip`;
  triggerBlobDownload(zipBlob, safeZip);
  return { ok: files.length, failed, total: list.length };
}
