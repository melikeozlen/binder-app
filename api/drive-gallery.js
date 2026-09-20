const { fetchDriveGalleryFromInput } = require('./driveGalleryLib');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

module.exports = async function handler(req, res) {
  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const folderInput =
      req.method === 'GET'
        ? req.query.folderUrl || req.query.folderId || req.query.url
        : req.body?.folderUrl || req.body?.folderId || req.body?.url;

    if (!folderInput || typeof folderInput !== 'string') {
      return res.status(400).json({
        error: 'Drive folder link or ID is required',
        code: 'INVALID_FOLDER',
      });
    }

    const apiKey = process.env.GOOGLE_DRIVE_API_KEY;
    const result = await fetchDriveGalleryFromInput(folderInput, apiKey);

    return res.status(200).json({
      folderId: result.folderId,
      count: result.items.length,
      items: result.items,
    });
  } catch (error) {
    const code = error.code || 'API_ERROR';
    const status =
      code === 'MISSING_API_KEY'
        ? 503
        : code === 'INVALID_FOLDER' || code === 'NO_IMAGES'
          ? 400
          : code === 'FOLDER_NOT_FOUND' || code === 'FOLDER_ACCESS_DENIED'
            ? 404
            : 502;

    return res.status(status).json({
      error: error.message || 'Drive gallery request failed',
      code,
    });
  }
};
