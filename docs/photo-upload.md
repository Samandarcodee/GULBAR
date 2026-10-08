# GulBar rasmlari

Do‘kon paneli → Gullar va narxlar → Gul qo‘shish yoki Tahrirlash → Galereyadan tanlash → Saqlash.

Telefon galereyasidagi rasm oldindan ko‘rsatiladi. Brauzer uni 1600 pikselgacha kichraytirib, 1 MB dan kichik JPEG qilib tayyorlaydi. Boshlang‘ich fayl 20 MB gacha bo‘lishi mumkin. Brauzer ocholmaydigan formatni JPG yoki PNG qilib tanlash kerak. Mavjud HTTPS havolalar ham ishlaydi.

Yuklash do‘kon sessiyasi bilan `/api/merchant/:shopId/images` orqali bajariladi. Faqat JPG, PNG va WebP fayl belgilariga ega rasmlar qabul qilinadi; SVG/HTML rad etiladi. Fayllar o‘zgarmaydigan tasodifiy ID bilan saqlanadi va `/api/images/:id` orqali ommaviy katalogda ko‘rinadi. Mahalliy server SQLite, Cloudflare esa D1 `images` jadvalidan foydalanadi. Rasmlar yangi gulni saqlash bosilgandagina serverga yuboriladi.

Cloudflare hisobida R2 yoqilmaganligi sababli MVP uchun D1 ishlatilmoqda. Katalog kattalashganda rasm saqlashni R2 ga ko‘chirish mumkin. Mahsulot saqlanishi muvaffaqiyatsiz bo‘lsa, yuklangan rasm manzili qayta urinish uchun formada saqlanadi; forma bekor qilinganda bunday foydalanilmagan yuklamalar hozircha bazada qoladi.

Jonli bazaga yangi jadval qo‘shish: `npx wrangler d1 execute gulbar-live --remote --file cloudflare/migrations/0004_images.sql`. Bu baza avval to‘g‘ridan-to‘g‘ri SQL bilan tayyorlangan, eski migratsiyalarni qayta ishga tushirmang.

Sinovlar: `npm test`, `npm run test:e2e`, `npm run cf:check`. `cloudflare/accounts-smoke.mjs` faqat mahalliy Worker va D1 da rasm yuklash, baytlarni qayta o‘qish va xavfli faylni rad etishni tekshiradi.
