const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

// .env.local önce, sonra .env (mevcut değerler ezilmez)
try {
  const dotenv = require('dotenv');
  dotenv.config({ path: path.join(projectRoot, '.env.local') });
  dotenv.config({ path: path.join(projectRoot, '.env') });
} catch {
  // dotenv yoksa ortam değişkenleri zaten set edilmiş olmalı
}

const isProd =
  process.env.NODE_ENV === 'production' || Boolean(process.env.RAILWAY_ENVIRONMENT);

const toInt = (value, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const splitList = (value) =>
  String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const clientOrigins = splitList(process.env.CLIENT_ORIGIN);

// İstatistik panelini görebilecek kullanıcı adları (virgülle ayrılmış, büyük/küçük harf duyarsız)
const adminUsernames = new Set(splitList(process.env.ADMIN_USERNAMES).map((s) => s.toLowerCase()));

module.exports = {
  projectRoot,
  isProd,
  port: toInt(process.env.PORT, 4000),
  databaseUrl: process.env.DATABASE_URL || '',
  clientOrigins,
  // Frontend farklı origin'de ise cookie SameSite=None olmalı
  crossSiteCookies: clientOrigins.length > 0,
  sessionCookieName: 'binder_session',
  sessionTtlMs: toInt(process.env.SESSION_TTL_DAYS, 30) * 24 * 60 * 60 * 1000,
  maxUserStorageBytes: toInt(process.env.MAX_USER_STORAGE_MB, 300) * 1024 * 1024,
  buildDir: path.join(projectRoot, 'build'),
  serveStatic: process.env.SERVE_STATIC !== 'false',
  adminUsernames,
  stats: {
    eventRetentionDays: toInt(process.env.EVENT_RETENTION_DAYS, 180),
  },
  limits: {
    docBody: '15mb',
    imagesBody: '30mb',
    maxPages: 200,
    maxImageBytes: 8 * 1024 * 1024,
    maxDefaultBackImageBytes: 8 * 1024 * 1024,
    maxImagesPerRequest: 200,
    maxNameLength: 200,
  },
};
