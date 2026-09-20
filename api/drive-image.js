const DRIVE_MEDIA_URL = 'https://www.googleapis.com/drive/v3/files';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

function isValidFileId(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]{10,}$/.test(id);
}

module.exports = async function handler(req, res) {
  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const fileId = req.query?.id;
  if (!isValidFileId(fileId)) {
    return res.status(400).json({ error: 'Invalid file id', code: 'INVALID_FILE' });
  }

  const apiKey = process.env.GOOGLE_DRIVE_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: 'GOOGLE_DRIVE_API_KEY is not configured',
      code: 'MISSING_API_KEY',
    });
  }

  try {
    const mediaUrl = `${DRIVE_MEDIA_URL}/${fileId}?alt=media&key=${encodeURIComponent(apiKey)}`;
    const upstream = await fetch(mediaUrl);

    if (!upstream.ok) {
      return res.status(upstream.status === 404 ? 404 : 502).json({
        error: 'Drive image could not be fetched',
        code: upstream.status === 404 ? 'FILE_NOT_FOUND' : 'UPSTREAM_ERROR',
      });
    }

    const contentType = upstream.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      return res.status(415).json({
        error: 'File is not an image',
        code: 'NOT_AN_IMAGE',
      });
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
    res.setHeader('Content-Length', buffer.length);
    return res.status(200).send(buffer);
  } catch (error) {
    console.error('[api/drive-image]', error);
    return res.status(502).json({
      error: error.message || 'Drive image proxy failed',
      code: 'API_ERROR',
    });
  }
};
