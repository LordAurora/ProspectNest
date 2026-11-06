# ProspectNest

Evidence-based business prospecting with rule-based qualification, optional local AI, and Google Sheets sync.

ProspectNest, potansiyel müşterileri tek bir çalışma alanında toplar: işletmeleri CSV veya elle ekler, web sitelerindeki açık bilgileri inceler, bulguları kaynağıyla birlikte saklar ve açıklanabilir bir öncelik puanı üretir.

> **Durum:** erken geliştirme. Temel altyapı (auth, veri modeli, worker, arayüz kabuğu) hazır; içe aktarma, araştırma hattı ve entegrasyonlar sırayla ekleniyor. Ayrıntı: [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md).

## Mimari

| Parça | Görev |
| --- | --- |
| `apps/web` | Next.js arayüzü, oturum yönetimi, kısa API istekleri |
| `apps/worker` | Uzun süren işler: araştırma, puanlama, aktarım, zamanlayıcı (pg-boss) |
| `packages/core` | Paylaşılan tipler, ortam şeması, normalizasyon |
| `packages/db` | Prisma şeması, migration, seed ve yönetici komutu |

PostgreSQL asıl kayıt sistemidir; Google Sheets yalnızca aktarım hedefidir. Uzun işler web isteği içinde çalışmaz: web işi kuyruğa yazar, worker yürütür.

## Kurulum

Gereksinimler: Node.js 22+, pnpm 10, PostgreSQL 17 (veya Docker).

```bash
pnpm install
cp .env.example .env          # SESSION_SECRET ve DATABASE_URL'i doldurun
pnpm db:migrate
pnpm admin:create --email siz@example.com
pnpm db:seed                  # isteğe bağlı: etiketli sentetik demo verisi
pnpm dev                      # web: http://localhost:3000 + worker
```

### Docker Compose

```bash
cp .env.example .env          # POSTGRES_PASSWORD ve SESSION_SECRET'i doldurun
docker compose up -d --build
docker compose run --rm migrate pnpm admin:create --email siz@example.com
```

Konteyner içinde `localhost` konteynerin kendisidir, bilgisayarınız değil. Ollama'yı bilgisayarınızda çalıştırıyorsanız worker ona `host.docker.internal` üzerinden ulaşır.

## Veri kaynakları

Google Maps verisi kazınmaz veya kopyalanmaz; platform koşulları buna izin vermez. İlk sürümde işletmeler kullanıcıya ait/izinli CSV dosyalarından veya elle eklenir. Canlı keşif, arama ve saklamaya izin veren bir sağlayıcı yapılandırılana kadar arayüzde "bağlantı gerekli" olarak görünür.

## Güvenlik

- Genel kayıt yok; tek yönetici kurulum komutuyla oluşturulur.
- Parolalar argon2id ile, oturum tokenları yalnızca HMAC özeti olarak saklanır.
- Sırlar `.env` dışında bir yere yazılmaz; `.env` depoya eklenmez.
