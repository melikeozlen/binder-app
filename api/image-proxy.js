/**
 * Harici görsel proxy — tarayıcı CORS engelini aşmak için (Pinterest vb.).
 * GET /api/image-proxy?url=<encoded absolute http(s) url>
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const MAX_BYTES = 12 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 20_000;

function isPrivateHostname(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    return true;
  }
  // IPv4 private / link-local
  const m = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
  }
  return false;
}

function parseTargetUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let parsed;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (isPrivateHostname(parsed.hostname)) return null;
  return parsed;
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

  const target = parseTargetUrl(req.query?.url);
  if (!target) {
    return res.status(400).json({ error: 'Invalid url', code: 'INVALID_URL' });
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller
    ? setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    : null;

  try {
    const upstream = await fetch(target.href, {
      method: 'GET',
      redirect: 'follow',
      signal: controller?.signal,
      headers: {
        // Birçok CDN boş/Node UA'yı reddeder
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        Referer: `${target.protocol}//${target.host}/`,
      },
    });

    if (!upstream.ok) {
      return res.status(upstream.status === 404 ? 404 : 502).json({
        error: 'Upstream image could not be fetched',
        code: upstream.status === 404 ? 'NOT_FOUND' : 'UPSTREAM_ERROR',
      });
    }

    const contentType = (upstream.headers.get('content-type') || '').split(';')[0].trim();
    if (!contentType.startsWith('image/')) {
      return res.status(415).json({
        error: 'URL is not an image',
        code: 'NOT_AN_IMAGE',
      });
    }

    const lengthHeader = upstream.headers.get('content-length');
    if (lengthHeader && Number(lengthHeader) > MAX_BYTES) {
      return res.status(413).json({ error: 'Image too large', code: 'TOO_LARGE' });
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (buffer.length === 0) {
      return res.status(502).json({ error: 'Empty image body', code: 'EMPTY' });
    }
    if (buffer.length > MAX_BYTES) {
      return res.status(413).json({ error: 'Image too large', code: 'TOO_LARGE' });
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
    res.setHeader('Content-Length', buffer.length);
    return res.status(200).send(buffer);
  } catch (error) {
    console.error('[api/image-proxy]', error?.message || error);
    return res.status(502).json({
      error: error?.name === 'AbortError' ? 'Upstream timeout' : error.message || 'Proxy failed',
      code: error?.name === 'AbortError' ? 'TIMEOUT' : 'API_ERROR',
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
};
