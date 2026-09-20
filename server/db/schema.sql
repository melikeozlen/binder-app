-- Idempotent şema: her başlangıçta güvenle çalıştırılır.

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY,
  username      TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Kullanıcı adı büyük/küçük harf duyarsız benzersiz (Melike == melike)
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx ON users (lower(username));

CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

-- Binder dokümanı (istemcinin export şemasıyla aynı alanlar; resimler hariç)
CREATE TABLE IF NOT EXISTS binders (
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id                 TEXT NOT NULL,
  name               TEXT NOT NULL,
  settings           JSONB NOT NULL DEFAULT '{}'::jsonb,
  gallery_urls       JSONB NOT NULL DEFAULT '[]'::jsonb,
  page_ids           JSONB NOT NULL DEFAULT '[]'::jsonb,
  pages              JSONB NOT NULL DEFAULT '[]'::jsonb,
  default_back_image TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

-- Hücre resimleri (data URL). Sayfalar "__IMAGE_REF__<key>" ile referans verir.
CREATE TABLE IF NOT EXISTS images (
  user_id     UUID NOT NULL,
  binder_id   TEXT NOT NULL,
  key         TEXT NOT NULL,
  hash        TEXT NOT NULL,
  data        TEXT NOT NULL,
  size_bytes  INTEGER NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, binder_id, key),
  FOREIGN KEY (user_id, binder_id) REFERENCES binders(user_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS images_user_id_idx ON images(user_id);
