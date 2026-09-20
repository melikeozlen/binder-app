const IMAGE_MIME_PREFIX = 'image/';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const MAX_IMAGES = 500;
const MAX_FOLDER_DEPTH = 8;

const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';

/** Drive klasör veya dosya linkinden / ham ID'den folder ID çıkarır */
function parseDriveFolderId(input) {
  if (!input || typeof input !== 'string') return null;

  const trimmed = input.trim();
  if (!trimmed) return null;

  if (/^[a-zA-Z0-9_-]{10,}$/.test(trimmed)) {
    return trimmed;
  }

  const patterns = [
    /\/folders\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]) return match[1];
  }

  return null;
}

function stripImageExtension(name) {
  return String(name || '')
    .replace(/\.(jpe?g|png|gif|webp|bmp|heic|avif)$/i, '')
    .trim();
}

function driveImageViewUrl(fileId) {
  // uc?export=view <img> içinde güvenilir değil — thumbnail kullan
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w1000`;
}

async function driveListPage(folderId, apiKey, pageToken) {
  const params = new URLSearchParams({
    q: `'${folderId}' in parents and trashed=false`,
    fields: 'nextPageToken,files(id,name,mimeType)',
    pageSize: '100',
    orderBy: 'folder,name',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
    key: apiKey,
  });

  if (pageToken) {
    params.set('pageToken', pageToken);
  }

  const response = await fetch(`${DRIVE_FILES_URL}?${params.toString()}`);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data?.error?.message || `Drive API ${response.status}`;
    const err = new Error(message);
    err.status = response.status;
    err.code =
      response.status === 404
        ? 'FOLDER_NOT_FOUND'
        : response.status === 403
          ? 'FOLDER_ACCESS_DENIED'
          : 'API_ERROR';
    throw err;
  }

  return data;
}

async function listDriveGallery(folderId, apiKey, options = {}) {
  const {
    folderLabel = null,
    depth = 0,
    items = [],
    imageCount = { value: 0 },
  } = options;

  if (depth > MAX_FOLDER_DEPTH) {
    return items;
  }

  let pageToken = null;

  do {
    const data = await driveListPage(folderId, apiKey, pageToken);
    const files = data.files || [];

    for (const file of files) {
      if (imageCount.value >= MAX_IMAGES) {
        return items;
      }

      if (file.mimeType === FOLDER_MIME) {
        await listDriveGallery(file.id, apiKey, {
          folderLabel: file.name,
          depth: depth + 1,
          items,
          imageCount,
        });
        continue;
      }

      if (!file.mimeType?.startsWith(IMAGE_MIME_PREFIX)) {
        continue;
      }

      items.push({
        file: folderLabel,
        url: driveImageViewUrl(file.id),
        name: stripImageExtension(file.name) || file.name,
      });
      imageCount.value += 1;
    }

    pageToken = data.nextPageToken || null;
  } while (pageToken);

  return items;
}

async function fetchDriveGalleryFromInput(folderInput, apiKey) {
  if (!apiKey) {
    const err = new Error('GOOGLE_DRIVE_API_KEY is not configured');
    err.code = 'MISSING_API_KEY';
    throw err;
  }

  const folderId = parseDriveFolderId(folderInput);
  if (!folderId) {
    const err = new Error('Invalid Drive folder link or ID');
    err.code = 'INVALID_FOLDER';
    throw err;
  }

  const items = await listDriveGallery(folderId, apiKey, {
    folderLabel: null,
    depth: 0,
    items: [],
    imageCount: { value: 0 },
  });

  if (items.length === 0) {
    const err = new Error('No images found in folder');
    err.code = 'NO_IMAGES';
    throw err;
  }

  return { folderId, items };
}

module.exports = {
  parseDriveFolderId,
  fetchDriveGalleryFromInput,
  MAX_IMAGES,
};
