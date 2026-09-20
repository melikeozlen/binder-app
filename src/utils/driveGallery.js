import { parseDriveFolderId } from './driveGalleryParse';

const API_PATH = '/api/drive-gallery';

/**
 * Herkese açık Drive klasör linkinden galeri öğelerini yükler.
 * Vercel serverless function üzerinden çalışır (GOOGLE_DRIVE_API_KEY gerekir).
 */
export async function fetchDriveGallery(folderInput) {
  const trimmed = (folderInput || '').trim();
  if (!trimmed) {
    throw new DriveGalleryError('INVALID_FOLDER');
  }

  if (!parseDriveFolderId(trimmed)) {
    throw new DriveGalleryError('INVALID_FOLDER');
  }

  const response = await fetch(API_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folderUrl: trimmed }),
  });

  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new DriveGalleryError(data.code || 'API_ERROR', data.error);
  }

  if (!Array.isArray(data.items) || data.items.length === 0) {
    throw new DriveGalleryError('NO_IMAGES');
  }

  return {
    folderId: data.folderId,
    count: data.count ?? data.items.length,
    items: data.items,
  };
}

export class DriveGalleryError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'DriveGalleryError';
    this.code = code;
  }
}
