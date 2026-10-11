# GulBar rasmlari

Do‘kon paneli → Gullar va narxlar → Gul qo‘shish yoki Tahrirlash → **Rasmlar** → Galereyadan rasm tanlash → Saqlash.

- Bir gulga 1–5 ta rasm qo‘shiladi. **Birinchi rasm asosiy** (bosh sahifada va kartada ko‘rinadi), qolganlari galereya. Rasmni olib tashlasangiz, keyingisi asosiy bo‘ladi.
- Rasm havolasi **majburiy emas**. U «Havola orqali qo‘shish (ixtiyoriy)» ichida turadi va faqat rasmning o‘ziga olib boradigan HTTPS havolani qabul qiladi: havola avval rasm sifatida ochilib ko‘riladi, sayt manzili (masalan `https://sayt.uz/`) rad etiladi.
- Gul uchun kamida bitta rasm kerak. Rasm tanlanmasa, Saqlash bosilganda rasm bo‘limida «Gul uchun kamida bitta rasm tanlang.» deb yoziladi.
- Rasmi ochilmaydigan gul panelda va bosh sahifada buzuq rasm belgisi o‘rniga gul belgisini ko‘rsatadi; panelda gulni tahrirlab rasmni almashtirish mumkin.

Telefon galereyasidan tanlangan har bir rasm brauzerda 1600 pikselgacha kichraytirilib, 1 MB dan kichik JPEG qilinadi va **tanlanishi bilan darhol** serverga yuklanadi (ro‘yxatda ko‘rinadi). Boshlang‘ich fayl 20 MB gacha bo‘lishi mumkin. Brauzer ocholmaydigan formatni (masalan HEIC) JPG yoki PNG qilib tanlash kerak.

Yuklash do‘kon sessiyasi bilan `/api/merchant/:shopId/images` orqali bajariladi. Faqat JPG, PNG va WebP fayl belgilariga ega rasmlar qabul qilinadi; SVG/HTML rad etiladi. Fayllar o‘zgarmaydigan tasodifiy ID bilan saqlanadi va `/api/images/:id` orqali ommaviy katalogda ko‘rinadi. Mahalliy server SQLite, Cloudflare esa D1 `images` jadvalidan foydalanadi. Gul saqlanmasdan forma yopilsa, yuklangan rasmlar bazada foydalanilmay qoladi (hozircha tozalanmaydi).

Cloudflare hisobida R2 yoqilmaganligi sababli MVP uchun D1 ishlatilmoqda. Katalog kattalashganda rasm saqlashni R2 ga ko‘chirish mumkin.

Jonli bazaga yangi jadval qo‘shish: `npx wrangler d1 execute gulbar-live --remote --file cloudflare/migrations/0004_images.sql`. Bu baza avval to‘g‘ridan-to‘g‘ri SQL bilan tayyorlangan, eski migratsiyalarni qayta ishga tushirmang.

Sinovlar: `npm test`, `npm run test:e2e` (`tests/photos.spec.ts` rasm formasini tekshiradi), `npm run cf:check`. `cloudflare/accounts-smoke.mjs` faqat mahalliy Worker va D1 da rasm yuklash, baytlarni qayta o‘qish va xavfli faylni rad etishni tekshiradi.
