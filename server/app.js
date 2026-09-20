const fs = require('fs');
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const config = require('./config');
const { attachUser } = require('./auth');
const { errorHandler } = require('./errors');
const { createAuthRouter } = require('./routes/auth');
const { createBindersRouter } = require('./routes/binders');
const { createDriveRouter } = require('./routes/drive');

function createApp(pool) {
  const app = express();

  app.disable('x-powered-by');
  // Railway/Vercel proxy arkasında: secure cookie ve rate limit için gerçek IP
  app.set('trust proxy', 1);

  if (config.clientOrigins.length > 0) {
    app.use(
      cors({
        origin: config.clientOrigins,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      })
    );
  }

  app.use(cookieParser());
  // Yalnızca API isteklerinde oturum sorgula (statik dosyalarda gereksiz DB yükü olmasın)
  app.use('/api', attachUser(pool));

  app.get('/api/health', async (req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ ok: true });
    } catch (error) {
      res.status(503).json({ ok: false, error: 'Database unavailable' });
    }
  });

  app.use('/api/auth', createAuthRouter(pool));
  app.use('/api/binders', createBindersRouter(pool));
  app.use('/api', createDriveRouter());

  app.all('/api/*', (req, res) => {
    res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
  });

  // React build (aynı origin → cookie ve CORS derdi yok)
  if (config.serveStatic && fs.existsSync(config.buildDir)) {
    const indexHtml = path.join(config.buildDir, 'index.html');
    const noCache = (res) => res.setHeader('Cache-Control', 'no-cache');

    app.use(
      express.static(config.buildDir, {
        index: false,
        maxAge: '1h',
        setHeaders: (res, filePath) => {
          if (filePath.startsWith(path.join(config.buildDir, 'static'))) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          } else {
            noCache(res);
          }
        },
      })
    );

    app.get('*', (req, res) => {
      noCache(res);
      res.sendFile(indexHtml);
    });
  } else {
    app.get('*', (req, res) => {
      res.status(404).type('text').send('Build not found. Run "npm run build" first.');
    });
  }

  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
