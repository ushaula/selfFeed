# Duygu Günlüğü

Build gerektirmeyen, tek kullanıcılı statik PWA. Veriler tarayıcıdaki IndexedDB'de tutulur; sunucu yoktur.

## Kurallar
- Her konu için günde tek kayıt; kayıtlar düzenlenemez ve silinemez (veri katmanında güncelleme/silme fonksiyonu yok).
- Gelecek güne ve konunun başlangıcından önceki güne kayıt girilemez.
- Geçmiş boş günler yalnızca not yazılarak doldurulur ve "sonradan girildi" işaretlenir.
- İçe aktarma var olan kayıtların üzerine yazmaz, yalnızca eksikleri ekler.
- Kurallar istemci tarafında uygulanır; teknik olarak aşılabilir (amaç kendini yavaşlatmak).

## Yerelde çalıştırma
```
python -m http.server 8080
```
http://localhost:8080 adresini aç.

## Yayınlama (ücretsiz) ve iPhone'a kurulum
1. Klasörü bir GitHub reposuna at, Settings → Pages'ten yayınla (veya Cloudflare Pages).
2. iPhone Safari'de adresi aç → Paylaş → **Ana Ekrana Ekle**. Uygulamayı buradan aç (iOS veriyi bu şekilde korur).
3. Yedek sekmesinden düzenli JSON yedeği al. CSV, PC'de analiz içindir (Excel uyumlu, `;` ayraçlı).
4. Günlük hatırlatma için iOS Kısayollar/Hatırlatıcılar kullan.

## Dosyalar
- `js/rules.js` kurallar ve tarih yardımcıları, `js/db.js` IndexedDB, `js/stats.js` istatistikler, `js/app.js` arayüz.
- `sw.js` çevrimdışı çalışma için service worker.
