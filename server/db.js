const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const config = require('./config');

function needsSsl(databaseUrl) {
  if (process.env.PGSSLMODE === 'disable') return false;
  if (process.env.PGSSLMODE === 'require') return true;
  // Railway private network ve localhost SSL istemez; dış bağlantılar (proxy.rlwy.net vb.) ister
  return !/localhost|127\.0\.0\.1|\.railway\.internal/i.test(databaseUrl);
}

function createPool(databaseUrl = config.databaseUrl) {
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL tanımlı değil. .env.local dosyasına DATABASE_URL ekle (bkz. .env.example).'
    );
  }
  return new Pool({
    connectionString: databaseUrl,
    ssl: needsSsl(databaseUrl) ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}

async function initSchema(pool) {
  const sql = fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8');
  await pool.query(sql);
}

// Transaction yardımcısı
async function withTransaction(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore
    }
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { createPool, initSchema, withTransaction };
