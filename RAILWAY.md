# Railway Kurulum Rehberi (Full-Stack: Hesap + Bulut Binder)

Tek Railway servisi hem API'yi (`/api/*`) hem React `build/` klasörünü sunar. Yanında bir Postgres eklentisi çalışır.
Misafir modu aynen çalışır; giriş yapan kullanıcının binder'ları hesabına kaydedilir ve diğer cihazlarda açılır.
Hesap: yalnızca **kullanıcı adı + şifre** (e-posta yok). Kullanıcı adı büyük/küçük harf duyarsız benzersizdir.

## 1. Railway'de proje oluştur

1. [railway.com/dashboard](https://railway.com/dashboard) → **New Project** → **Deploy from GitHub repo** → bu repoyu seç.
2. Aynı projede **+ Create** → **Database** → **Add PostgreSQL**.

## 2. Servis değişkenleri

Uygulama servisi → **Variables** → ekle:

| Değişken | Değer |
|---|---|
| `DATABASE_URL` | **Add Variable Reference** → `${{Postgres.DATABASE_URL}}` |
| `GOOGLE_DRIVE_API_KEY` | (opsiyonel) Drive galeri için mevcut anahtarın |

`PORT`'u Railway kendisi verir. `NODE_ENV` gerekmez (Railway ortamı otomatik algılanır).

Opsiyonel: `MAX_USER_STORAGE_MB` (varsayılan 300), `SESSION_TTL_DAYS` (varsayılan 30).

## 3. Build / Start

`railway.json` dosyası bunları zaten tanımlar; **Settings**'te elle bir şey yazman gerekmez:

- Build: `CI=false npm run build`
- Start: `node server/index.js`
- Healthcheck: `/api/health`

## 4. Domain

Servis → **Settings** → **Networking** → **Generate Domain**. Uygulama bu adreste hem frontend hem API olarak çalışır.

Deploy bitince kontrol: `https://<domain>/api/health` → `{"ok":true}`

Şema (`server/db/schema.sql`) ilk başlangıçta otomatik oluşturulur; migration komutu yok.

---

## Lokal geliştirme

```bash
cp .env.example .env.local
# .env.local içine DATABASE_URL yaz:
#   Railway → Postgres → Connect → "Public Network" bağlantı URL'i
#   (veya lokal Postgres: postgresql://postgres:postgres@localhost:5432/binder)

npm install
npm run server   # API → http://localhost:4000  (ayrı terminal)
npm start        # React → http://localhost:3000 (/api/auth, /api/binders → 4000'e proxy)
```

Prod benzeri lokal test: `npm run build && npm run server` → http://localhost:4000

---

## Frontend Vercel'de kalacaksa (opsiyonel, iki domain)

1. Railway servisine `CLIENT_ORIGIN=https://<vercel-domain>` ekle (cookie'ler `SameSite=None; Secure` olur).
2. Vercel'e `REACT_APP_API_URL=https://<railway-domain>` ekle.

Tek domain (yalnızca Railway) daha basittir; önerilen budur.

---

## Mimari özet

```
server/
  index.js          başlangıç, şema init, graceful shutdown
  app.js            Express: /api/health, /api/auth, /api/binders, /api/drive-*, static build
  auth.js           kullanıcı adı (3-32, harf/rakam/_/.) + bcrypt şifre, httpOnly oturum çerezi
  routes/auth.js    POST register|login|logout, GET me  (rate limit: 30 / 15 dk)
  routes/binders.js GET list, GET/PUT/DELETE :id, GET :id/images, POST :id/images/fetch, PUT :id/images
  routes/shares.js  GET list, POST (gönder), POST :id/accept | :id/reject, DELETE :id (iptal)
  db/schema.sql     users, sessions, binders (JSONB doküman), images (data URL + hash + kota), binder_shares

src/
  contexts/AuthContext.js   user / login / register / logout
  utils/apiClient.js        fetch sarmalayıcı (credentials: include)
  utils/cloudSync.js        push / pull / reconcile (hash tabanlı fark, çakışmada kopya)
  hooks/useCloudSync.js     App ↔ sync köprüsü (debounce push, 60 sn poll, odaklanmada pull)
  hooks/useShares.js        gelen/giden paylaşımlar (60 sn poll), gönder / kabul / reddet / iptal
  components/AuthModal.js   Giriş / Kayıt / Hesap + Paylaşımlar penceresi (Footer'daki 👤 butonu)
```

Binder paylaşımı (kopya gönderme):

- Binder menüsünde **kayıtlı** (☁️ Kayıtlı) bir binder'ın yanındaki **↗ Paylaş** → kullanıcı adı yazılır → karşı tarafa bekleyen paylaşım gider.
- Alıcı hesap penceresinde (footer'daki 👤 butonu, kırmızı rozet = bekleyen sayısı) **Kabul** / **Reddet** eder.
  Kabulde binder + resimler alıcının hesabına **yeni bir binder olarak kopyalanır** ve eşitleme ile cihazına iner.
  Kopya bağımsızdır: iki taraf birbirinin binder'ını etkilemez (canlı ortak düzenleme yoktur).
- Gönderen, alıcı yanıtlamadan **İptal** edebilir. Gönderen binder'ı silerse bekleyen paylaşım otomatik iptal olur.
- Aynı binder aynı kişiye ikinci kez bekleyen paylaşım olarak gönderilemez; alıcının kotası yetmezse kabul 413 döner ve paylaşım beklemede kalır.

Eşitleme davranışı:

- Bulut kaydı **opt-in**: yerel binder'lar otomatik yüklenmez. Binder menüsünde (⋮) her yerel binder'ın yanında
  **☁ Kaydet** butonu vardır; giriş yoksa giriş penceresi açılır ve giriş sonrası kayıt otomatik tamamlanır.
  Kaydedilen binder **☁️ Kayıtlı** rozeti alır ve o andan itibaren otomatik eşitlenir.
- Kayıtlı seçili binder'daki her değişiklik 2.5 sn sonra push edilir; içerik hash'i aynıysa istek atılmaz.
- Resimler hash ile karşılaştırılır; yalnızca yeni/değişenler yüklenir. Doküman kaydında referanssız resimler sunucuda silinir.
- Girişte tam uzlaştırma: buluttaki binder'lar çekilir, kayıtlı yerel binder'lardaki değişiklikler gönderilir; kaydedilmemiş yerel binder'lara dokunulmaz.
- Her iki tarafta da değişmişse veri kaybı yoktur: bulut sürümü "… (bulut kopyası)" adıyla ayrı binder olarak eklenir, yerel sürüm push edilir.
- Başka cihazda silinen binder yerelden de kaldırılır (bulut tamamen boşsa silme yayılmaz; yeniden push edilir).
- Çıkış yapılınca yerel veri silinmez; misafir modunda devam eder.
