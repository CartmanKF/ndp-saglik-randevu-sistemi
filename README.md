# Sağlık Randevu Sistemi

Bu proje Nesneye Dayalı Programlama dersi için hazırlanmış, tarayıcıda çalışan bir hastane ve klinik randevu uygulamasıdır. Ek paket veya veritabanı kurulumu gerektirmez. Kayıtlar tarayıcının `localStorage` alanında tutulur.

## Çalıştırma

En kolay yöntem `index.html` dosyasını tarayıcıda açmaktır. İsterseniz klasörde bir yerel sunucu da başlatabilirsiniz:

```powershell
python -m http.server 8000
```

Ardından `http://localhost:8000` adresine gidilir.

## Özellikler

- Birden fazla klinik ve şube tanımı
- Klinik çalışma saatleri, bölümler, hizmet süresi ve ücret bilgisi
- Doktor, uzmanlık, sunduğu hizmetler ve haftalık uygunluk tanımı
- Hasta, doktor ve klinik yöneticisi rolleri
- Doktorun uygunluk aralığı ve randevu çakışması kontrolü
- Doktor takvimi, hizmet süresi ve mevcut kayıtlar üzerinden otomatik uygun saat seçenekleri
- Geçmiş tarih ve saatler için randevu oluşturmayı engelleme
- Bekleyen, onaylanan ve iptal edilen randevu durumları
- Randevu detaylarının tarayıcıda kalıcı olarak saklanması
- Mobil ekrana uyumlu arayüz

## Testler

Node.js 18 veya daha yeni bir sürümle:

```powershell
npm test
```

Testler; randevu oluşturma, uygunluk, otomatik saat üretimi, geçmiş zaman kontrolü, çakışma, iptal sonrası saatin tekrar kullanılması ve onay akışını kapsar.

## Nesneye dayalı yapı

`Clinic`, `HealthService`, `Employee`, `Doctor` ve `Appointment` temel alan sınıflarıdır. `Doctor`, `Employee` sınıfından kalıtım alır. Randevu kuralları `AppointmentService` içinde, veri saklama ayrıntıları ise `MemoryStore` ve `LocalStorageStore` sınıflarında tutulur. Bu ayrım kapsülleme ve tek sorumluluk ilkesini destekler.

## Klasör yapısı

```text
index.html          Kullanıcı arayüzü
styles.css          Sayfa tasarımı
js/domain.js        Alan sınıfları ve iş kuralları
js/storage.js       Veri erişim katmanı ve örnek veriler
js/app.js           Arayüz olayları ve ekran çizimi
tests/              Otomatik testler
PROJE_RAPORU.md     Tasarım ve kullanım açıklamaları
```
