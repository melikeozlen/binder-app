/** Google Drive dosya ID'sini çeşitli URL formatlarından çıkarır */
export function extractDriveFileId(input) {
  if (!input || typeof input !== 'string') return null;

  const trimmed = input.trim();

  if (/^[a-zA-Z0-9_-]{10,}$/.test(trimmed)) {
    return trimmed;
  }

  const patterns = [
    /\/api\/drive-image\?id=([a-zA-Z0-9_-]+)/,
    /thumbnail\?id=([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]) return match[1];
  }

  return null;
}

/** <img> için önerilen Drive thumbnail URL (herkese açık dosyalar) */
export function driveThumbnailUrl(fileId, size = 'w1000') {
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=${size}`;
}

/** Sunucu proxy — thumbnail başarısız olursa yedek */
export function driveProxyUrl(fileId) {
  return `/api/drive-image?id=${encodeURIComponent(fileId)}`;
}

/** Eski uc?export=view veya proxy URL → thumbnail */
export function normalizeDriveImageUrl(url) {
  const fileId = extractDriveFileId(url);
  if (!fileId) return url;
  return driveThumbnailUrl(fileId);
}

export function isDriveImageUrl(url) {
  return Boolean(extractDriveFileId(url));
}

/** Galeri / binder için sırayla: thumbnail → proxy */
export function getDriveImageFallbacks(urlOrId) {
  const fileId = extractDriveFileId(urlOrId) || urlOrId;
  if (!fileId || !/^[a-zA-Z0-9_-]{10,}$/.test(fileId)) {
    return [urlOrId].filter(Boolean);
  }

  return [driveThumbnailUrl(fileId), driveProxyUrl(fileId)];
}
