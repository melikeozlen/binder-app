const config = require('./config');
const { createPool, initSchema } = require('./db');
const { purgeExpiredSessions } = require('./auth');
const { purgeOldEvents } = require('./stats');
const { createApp } = require('./app');

async function main() {
  const pool = createPool();
  await initSchema(pool);
  await purgeExpiredSessions(pool).catch(() => {});

  const purgeTimer = setInterval(() => {
    purgeExpiredSessions(pool).catch((e) => console.warn('[server] session purge failed:', e.message));
    purgeOldEvents(pool).catch((e) => console.warn('[server] event purge failed:', e.message));
  }, 60 * 60 * 1000);
  purgeTimer.unref();

  const app = createApp(pool);
  const server = app.listen(config.port, () => {
    console.log(`[server] listening on port ${config.port} (${config.isProd ? 'production' : 'development'})`);
    if (!config.isProd) {
      console.log(`[server] API: http://localhost:${config.port}/api/health`);
    }
  });

  const shutdown = (signal) => {
    console.log(`[server] ${signal} received, shutting down...`);
    clearInterval(purgeTimer);
    server.close(() => {
      pool.end().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
  console.error('[server] failed to start:', error.message);
  process.exit(1);
});
