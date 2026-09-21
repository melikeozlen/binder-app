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
-- Oturumun en son ne zaman aktif görüldüğü (presence heartbeat ile, ≥60 sn aralıkla güncellenir)
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

-- Kullanım olayları (istatistik): visit, login, register, binder_created, ...
-- user_id giriş yapılmamışsa NULL; client_id tarayıcı başına anonim kimlik.
CREATE TABLE IF NOT EXISTS events (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  client_id   TEXT,
  props       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_created_at_idx ON events(created_at);
CREATE INDEX IF NOT EXISTS events_name_created_idx ON events(name, created_at);

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

-- Paylaşılan binder üyeleri: binder'ın tek sahibi vardır (binders.user_id), üyeler aynı
-- binder'a erişir. role: edit (düzenleyebilir) | view (sadece görüntüleme).
-- Sahip binder'ı silerse üyelikler de silinir.
CREATE TABLE IF NOT EXISTS binder_members (
  owner_id    UUID NOT NULL,
  binder_id   TEXT NOT NULL,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'edit' CHECK (role IN ('edit', 'view')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, binder_id, user_id),
  FOREIGN KEY (owner_id, binder_id) REFERENCES binders(user_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS binder_members_user_idx ON binder_members(user_id);
-- Eski kurulumlar için (tablo role'süz oluşturulduysa)
ALTER TABLE binder_members ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'edit';

-- Paylaşım daveti. Alıcı kabul edince binder_members'a eklenir (kopya oluşmaz).
-- status: pending | accepted | rejected | cancelled ; role: davetle verilen yetki
CREATE TABLE IF NOT EXISTS binder_shares (
  id            UUID PRIMARY KEY,
  from_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  binder_id     TEXT NOT NULL,
  binder_name   TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'edit' CHECK (role IN ('edit', 'view')),
  status        TEXT NOT NULL DEFAULT 'pending',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at  TIMESTAMPTZ
);
ALTER TABLE binder_shares ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'edit';
CREATE INDEX IF NOT EXISTS binder_shares_to_pending_idx
  ON binder_shares(to_user_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS binder_shares_from_pending_idx
  ON binder_shares(from_user_id) WHERE status = 'pending';
-- Aynı binder aynı kişiye ikinci kez bekleyen paylaşım olarak gönderilemez
CREATE UNIQUE INDEX IF NOT EXISTS binder_shares_pending_unique_idx
  ON binder_shares(from_user_id, to_user_id, binder_id) WHERE status = 'pending';

-- Oturum son görülme (istatistik: bugün/hafta aktif kullanıcı). Nullable: eski satırlar bozulmaz.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS sessions_last_seen_at_idx ON sessions(last_seen_at);

-- Uygulama olayları (giriş, ziyaret, binder oluşturma…). user silinince satır kalır (user_id null).
CREATE TABLE IF NOT EXISTS events (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  client_id   TEXT,
  props       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_created_at_idx ON events(created_at);
CREATE INDEX IF NOT EXISTS events_name_created_idx ON events(name, created_at DESC);
