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
  routes/binders.js GET list (kendi + paylaşılan), GET/PUT/DELETE :id, GET :id/images, POST :id/images/fetch, PUT :id/images
                    (binder sahip ya da üye olunan hesapta çözülür; DELETE üye için "ayrıl" anlamına gelir)
  routes/shares.js  GET list (bekleyen + üyelikler), POST (davet), POST :id/accept | :id/reject, DELETE :id (iptal),
                    DELETE members/:binderId/:userId (sahip üyeyi kaldırır)
  db/schema.sql     users, sessions, binders (JSONB doküman), images (data URL + hash + kota), binder_members, binder_shares

src/
  contexts/AuthContext.js   user / login / register / logout
  utils/apiClient.js        fetch sarmalayıcı (credentials: include)
  utils/cloudSync.js        push / pull / reconcile (hash tabanlı fark, çakışmada kopya)
  hooks/useCloudSync.js     App ↔ sync köprüsü (debounce push, 60 sn poll, odaklanmada pull)
  hooks/useShares.js        bekleyen davetler + üyelikler (60 sn poll), gönder / kabul / reddet / iptal / kaldır / ayrıl
  components/AuthModal.js   Giriş / Kayıt / Hesap + Paylaşımlar penceresi (Footer'daki 👤 butonu)
  contexts/ToastContext.js  Bildirimler (toast): useToast().notify({ kind, text }) — giriş/kayıt/çıkış,
                            binder oluştur/sil/içe-dışa aktar, buluta kaydet, eşitleme hatası, kota,
                            paylaşım gönder/gelen davet/kabul/reddet/iptal/yetki/kaldır/ayrıl
```

Binder paylaşımı (tek sahip + üyeler, kopya yok):

- Bir binder'ın **tek sahibi** vardır (`binders.user_id`). Paylaşımı kabul eden kişi `binder_members` tablosuna
  **üye** olur ve **aynı binder'a** erişir: herkesin düzenlemesi herkese yansır, resimler sahibin kotasından düşer.
- Binder menüsünde **kayıtlı** (☁️ Kayıtlı) bir binder'ın yanındaki **↗ Paylaş** → kullanıcı adı + **yetki** → karşı tarafa bekleyen davet gider.
  Yalnızca sahip paylaşabilir; üyeler paylaşamaz.
- Yetki (`binder_members.role`): **Düzenleyebilir** (`edit`, varsayılan) veya **Sadece görüntüleme** (`view`).
  `view` üyesi için sunucu tüm yazma isteklerini 403 `READ_ONLY` ile reddeder; istemci de düzenleme kontrollerini kapatır,
  banner gösterir (👁) ve buluta push yapmaz; bulut her zaman kazanır. Sahip, hesap penceresinden yetkiyi
  sonradan değiştirebilir (`PATCH /api/shares/members/:binderId/:userId { role }`).
- Alıcı hesap penceresinde (footer'daki 👤 butonu, kırmızı rozet = bekleyen sayısı) **Kabul** / **Reddet** eder.
  Kabulde binder eşitleme ile alıcının cihazına iner ve menüde **👥 @sahip** (düzenleyebilir) ya da **👁 @sahip** (sadece görüntüleme) rozetiyle görünür.
- Gönderen, alıcı yanıtlamadan **İptal** edebilir. Sahip binder'ı silerse bekleyen davetler iptal olur, üyelikler silinir
  ve binder üyelerin cihazından da kaldırılır.
- Hesap penceresinde **Paylaştıklarım** (sahip → üyeyi **Kaldır**) ve **Benimle paylaşılan** (üye → **Ayrıl**) listeleri vardır.
  Üye, binder menüsündeki ⏏ ile de ayrılabilir; bu sahibin binder'ını etkilemez.
- Aynı kişiye ikinci davet gönderilemez (bekleyen varsa 409 `SHARE_EXISTS`, zaten üyeyse 409 `ALREADY_MEMBER`).
- İki taraf aynı anda düzenlemişse çakışma kuralı geçerlidir: bulut sürümü "… (bulut kopyası)" adıyla o kişinin
  **kendi** hesabına ayrı binder olarak eklenir, yerel sürüm paylaşılan binder'a yazılır.

Eşitleme davranışı:

- Bulut kaydı **opt-in**: yerel binder'lar otomatik yüklenmez. Binder menüsünde (⋮) her yerel binder'ın yanında
  **☁ Kaydet** butonu vardır; giriş yoksa giriş penceresi açılır ve giriş sonrası kayıt otomatik tamamlanır.
  Kaydedilen binder **☁️ Kayıtlı** rozeti alır ve o andan itibaren otomatik eşitlenir.
- Yerel binder listesi hesaba özeldir (`binders-list:guest` / `binders-list:user:<username>`).
  Girişte misafir binder'lar o hesaba taşınır; hesap değiştirince diğer hesabın listesi görünmez.
- Kayıtlı seçili binder'daki her değişiklik 2.5 sn sonra push edilir; içerik hash'i aynıysa istek atılmaz.
  Üst çubuktaki **💾 Kaydet** butonu kaydedilmemiş değişiklik varken aktif olur (beklemeden push);
  buluta yazılmamış değişiklik varken sayfa yenilenirse/kapatılırsa tarayıcı onay ister (`beforeunload`).
- Girişteki reconcile, hesabın yerel binder listesi yüklenmeden başlamaz; binder değişiminde de yükleme bitmeden
  state yazılmaz. Böylece buluttaki sürüm yereldeki henüz gönderilmemiş değişiklikleri ezmez.
- Resimler hash ile karşılaştırılır; yalnızca yeni/değişenler yüklenir. Doküman kaydında referanssız resimler sunucuda silinir.
- Girişte tam uzlaştırma: buluttaki binder'lar çekilir, kayıtlı yerel binder'lardaki değişiklikler gönderilir; kaydedilmemiş yerel binder'lara dokunulmaz.
- Her iki tarafta da değişmişse veri kaybı yoktur: bulut sürümü "… (bulut kopyası)" adıyla ayrı binder olarak eklenir, yerel sürüm push edilir.
- Başka cihazda silinen binder yerelden de kaldırılır (bulut tamamen boşsa silme yayılmaz; yeniden push edilir).
- Çıkış yapılınca yerel veri silinmez; misafir modunda devam eder.
