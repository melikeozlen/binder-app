const path = require('path');
const fs = require('fs');
const express = require('express');

const projectRoot = path.resolve(__dirname, '..');
const envLocalPath = path.join(projectRoot, '.env.local');
const envPath = path.join(projectRoot, '.env');

function loadEnvFiles() {
  try {
    // react-scripts ile birlikte gelen dotenv
    require('dotenv').config({ path: envLocalPath });
    require('dotenv').config({ path: envPath });
  } catch {
    loadEnvFileManual(envLocalPath);
    loadEnvFileManual(envPath);
  }
}

function loadEnvFileManual(filePath) {
  try {
    if (!fs.existsSync(filePath)) return;

    fs.readFileSync(filePath, 'utf8')
      .split('\n')
      .forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;

        const eq = trimmed.indexOf('=');
        if (eq === -1) return;

        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }

        if (key && !process.env[key]) {
          process.env[key] = value;
        }
      });
  } catch (error) {
    console.warn(`[setupProxy] env okunamadı (${filePath}):`, error.message);
  }
}

loadEnvFiles();

const driveGalleryHandler = require('../api/drive-gallery');
const driveImageHandler = require('../api/drive-image');
const imageProxyHandler = require('../api/image-proxy');

const API_PROXY_TARGET = process.env.API_PROXY_TARGET || 'http://localhost:4000';
const BACKEND_PATHS = [
  '/api/auth',
  '/api/binders',
  '/api/shares',
  '/api/health',
  '/api/presence',
  '/api/events',
  '/api/admin',
];

/**
 * CRA dev server'da:
 *  - /api/drive-* → Vercel tarzı handler'lar (api/) doğrudan çalışır
 *  - /api/auth, /api/binders, /api/health → `npm run server` ile ayakta olan
 *    Express backend'e (localhost:4000) proxy'lenir (cookie'ler aynı host'ta kalır)
 */
module.exports = function setupProxy(app) {
  try {
    const { createProxyMiddleware } = require('http-proxy-middleware');
    app.use(
      BACKEND_PATHS,
      createProxyMiddleware({
        target: API_PROXY_TARGET,
        changeOrigin: false,
        logLevel: 'warn',
        onError: (err, req, res) => {
          if (res.headersSent) return;
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              error: `API server not running at ${API_PROXY_TARGET}. Start it with "npm run server".`,
              code: 'API_UNAVAILABLE',
            })
          );
        },
      })
    );
    console.log(`[dev] ${BACKEND_PATHS.join(', ')} → ${API_PROXY_TARGET}`);
  } catch (error) {
    console.warn('[dev] http-proxy-middleware yüklenemedi, backend proxy devre dışı:', error.message);
  }

  app.all('/api/drive-gallery', express.json(), async (req, res) => {
    try {
      await driveGalleryHandler(req, res);
    } catch (error) {
      console.error('[api/drive-gallery]', error);
      if (!res.headersSent) {
        res.status(500).json({
          error: error.message || 'Internal error',
          code: 'API_ERROR',
        });
      }
    }
  });

  app.get('/api/drive-image', async (req, res) => {
    try {
      await driveImageHandler(req, res);
    } catch (error) {
      console.error('[api/drive-image]', error);
      if (!res.headersSent) {
        res.status(502).json({
          error: error.message || 'Image proxy error',
          code: 'API_ERROR',
        });
      }
    }
  });

  app.get('/api/image-proxy', async (req, res) => {
    try {
      await imageProxyHandler(req, res);
    } catch (error) {
      console.error('[api/image-proxy]', error);
      if (!res.headersSent) {
        res.status(502).json({
          error: error.message || 'Image proxy error',
          code: 'API_ERROR',
        });
      }
    }
  });

  const hasKey = Boolean(process.env.GOOGLE_DRIVE_API_KEY?.trim());

  console.log('[dev] /api/drive-gallery, /api/drive-image, /api/image-proxy hazır');
  if (!hasKey) {
    console.warn(
      '[dev] GOOGLE_DRIVE_API_KEY bulunamadı.\n' +
        `       → ${envLocalPath} dosyası oluştur\n` +
        '       → içine: GOOGLE_DRIVE_API_KEY=AIza...\n' +
        '       → npm start\'ı yeniden başlat'
    );
  }
};
