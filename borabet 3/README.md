# BoraBet · Dominó Dupla 2v2 — Telegram Mini App

Next.js 14 + Supabase + Vercel. Oyuncu uygulaması **Portekizce (pt-BR)**, yönetim paneli **Türkçe**.

---

## 1) Supabase kurulumu (5 dk)

1. https://supabase.com → **New project** oluşturun (bölge: São Paulo önerilir).
2. Sol menü **SQL Editor → New query** → `supabase/schema.sql` dosyasının **tamamını** yapıştırıp **Run**.
   - Tüm tablolar, fonksiyonlar, güvenlik (RLS), 5 salon, 25 görev şablonu, 10 başlangıç botu ve ayarlar kurulur.
   - Tekrar çalıştırılabilir (mevcut veriyi silmez).
3. **Project Settings → API** sayfasından şunları kopyalayın:
   - `Project URL` → `SUPABASE_URL` ve `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` (gizli!) → `SUPABASE_SERVICE_ROLE_KEY`
4. **Database → Replication** (veya Publications) altında `supabase_realtime` yayınında `signals` tablosunun açık olduğunu kontrol edin (SQL bunu otomatik yapar). Realtime olmasa da oyun çalışır (akıllı yoklama ile), sadece biraz daha az anlık olur.

## 2) Telegram botu

1. Telegram'da **@BotFather** → `/newbot` → isim ve kullanıcı adı verin → **token**'ı alın (`TELEGRAM_BOT_TOKEN`).
2. `/newapp` → botunuzu seçin → başlık, açıklama, görsel → **Web App URL** olarak Vercel adresinizi girin (ör. `https://borabet.vercel.app`) → kısa ad verin (ör. `play`).
   - Kısa ad → `NEXT_PUBLIC_APP_SHORT_NAME`, bot kullanıcı adı (@ olmadan) → `NEXT_PUBLIC_BOT_USERNAME`.
3. (İsteğe bağlı) `/setmenubutton` ile botun menü butonunu aynı URL'ye bağlayın.

## 3) GitHub + Vercel

1. Bu klasörü GitHub'a yükleyin (yeni repo → dosyaları sürükleyin veya `git push`).
2. https://vercel.com → **Add New → Project** → repoyu seçin → Framework: **Next.js** (otomatik).
3. **Environment Variables** bölümüne `.env.example` içindeki tüm değişkenleri girin (`DEV_AUTH=0`).
4. **Deploy**. Bitince adresi (`https://xxx.vercel.app`) `NEXT_PUBLIC_APP_URL` olarak girip bir kez daha **Redeploy** yapın ve BotFather'daki Web App URL'sini bu adres yapın.

## 4) Webhook ( /start mesajı ve "Jogar" butonu için)

Tarayıcıda bir kez açın (değerleri kendinizinkilerle değiştirin):

```
https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<ALAN_ADINIZ>/api/telegram/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>
```

## 5) Zamanlayıcı (önemli)

Masalar her istekte kendini ilerletir; ama kimse uygulamayı açık tutmazken takılı kalan masaları temizlemek için dakikada bir şu adres çağrılmalı:

```
https://<ALAN_ADINIZ>/api/cron/sweep?key=<CRON_SECRET>
```

- Vercel **Pro** planında `vercel.json` içindeki cron'u `*/1 * * * *` yapabilirsiniz.
- **Ücretsiz (Hobby)** planda Vercel günde 1 cron'a izin verir; bu yüzden ücretsiz https://cron-job.org üzerinden yukarıdaki adresi **her 1 dakikada** çağıran bir iş oluşturun.

## 6) Yönetim paneli

`https://<ALAN_ADINIZ>/admin` → `ADMIN_PASSWORD` ile giriş.

| Bölüm | Ne yapar |
|---|---|
| **Genel Bakış** | Çevrimiçi oyuncu, canlı masalar, bot oranı, kasa geliri, bekleyen yatırım/çekim |
| **Botlar** | Bot ekle / toplu üret (Brezilya isimleri), isim, beceri (1–5), **düşünme süresi min–maks (ms)**, seviye, aktif/pasif |
| **Odalar & Maçlar** | Canlı masalar, **botlu oda açma**, boş koltuğa **bot ekleme**, koltuk boşaltma, maçı iptal + iade, elleri görme |
| **Salonlar** | Masa türleri: bahisler, hedef puan, beraberlik kuralı, tur süresi, **bu salonda bot izni**, VIP seviyesi |
| **Görevler** | Şablonlar ve **değişkenleri** (taban, seviye başına artış, zincir büyümesi, varyans, ödül formülü), canlı önizleme |
| **Oyuncular** | Arama, bakiye düzeltme, XP, engelle/sustur, KYC, mesaj, görev sıfırlama, hareket geçmişi |
| **Finans** | Yatırım onaylama (bonus + davet ödülü otomatik), çekim akışı: İncele → Gönderildi (tx) → Tamamlandı / Reddet (otomatik iade) |
| **Sohbet & Yağmur** | Mesaj silme, duyuru, **para yağmuru** |
| **Ayarlar** | **Bot olasılığı kaydırıcısı (%)**, bot bekleme süreleri, komisyon, çarpanlar, bonuslar, XP eğrisi, cüzdan adresleri… |
| **Raporlar** | Günlük kasa defteri ve admin işlem kaydı |

### Botlar nasıl çalışır?
- Masada en az 1 gerçek oyuncu varken her boş koltuk için `bot_fill_delay_min_s`–`max_s` arasında rastgele bir süre beklenir; süre dolunca **`bot_fill_probability` (%)** olasılıkla bot oturur. Botlar farklı anlarda oturur, "hazırım" demeleri de insan gibi gecikir.
- Oyuncu `matchmaking_max_wait_s` saniye bekledikten sonra "Completar com Bot" ile masayı kendisi doldurabilir (Ayarlar'dan kapatılabilir).
- Botlar sadece kendi ellerini ve masadaki açık bilgiyi görür; beceri seviyesine göre hata yapar. Hamle süresi admin'deki min–maks aralığında çan eğrisi + ara sıra dikkat dağınıklığı ile insan gibi olur.
- Botların bahsi kasadan ödenir, kazancı kasaya döner (Raporlar'da "Bot sonucu").
- Oyuncu tarafında botlar normal profil gibi görünür; masada küçük **BOT** etiketi vardır (tasarımdaki metin: "Jogadores Bot aparecem sempre com a etiqueta BOT na mesa").

### Görev algoritması
- **Günlük** (her gün 00:00 Brasília) ve **haftalık** (pazartesi) görevler ağırlıklı rastgele seçilir.
- **Seviye zinciri** görevleri sonsuzdur: ödül alınınca aynı şablonun bir sonraki adımı `hedef × büyüme^adım` ile doğar.
- **Başarımlar** ömür boyu istatistikten başlar (ör. 5 → 7 → 10 carroça…).
- Hedef = `(taban + seviye_başı × (seviye−1)) × büyüme^zincir × (1 ± varyans)`; ödül seviye ve zorlukla orantılı büyür.
- Seviye atlayınca `level_up_bonus × yeni seviye` BC bonus verilir.

## 7) Yerel test

```bash
npm install
cp .env.example .env.local   # değerleri doldurun, DEV_AUTH=1 yapın
npm run dev
```
- Oyuncu: http://localhost:3000/?dev=1 (farklı oyuncular için `?dev=2`, `?dev=3` … ayrı sekmelerde)
- Admin: http://localhost:3000/admin

## Oyun kuralları (uygulanan)
2v2 sem dorme (28 taş, 7'şer) · 1v1 com dorme · ilk elde 6-6 ile açılış · saat yönünün tersi · batida: rakip eldeki puanlar (carroça ×2, lá e lô ×3, cruzada ×4) · fechamento: en az puanlı takım masadaki tüm puanı alır; beraberlikte kapatmayan kazanır (Nordeste: el iptal) · hedef puan salondan · %10 komisyon · bağlantı kopması: sıra gelince süre işler, dönmezse takımı kaybeder; her takımdan biri düşerse maç iptal + komisyonsuz iade · her el için SHA-256 ile doğrulanabilir karıştırma.

## Güvenlik notları
- Tüm tablolar RLS ile kapalıdır; sadece sunucu (service_role) erişir. Tarayıcı yalnızca `signals` tablosunu (sadece sürüm numarası) okuyabilir.
- Her istek Telegram `initData` HMAC imzasıyla doğrulanır. Canlıda `DEV_AUTH=0` olmalı.
- Rakip eller ve deste hiçbir zaman istemciye gönderilmez.
