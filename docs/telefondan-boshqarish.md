# GulBar'ni telefondan boshqarish

Kompyuter o'chiq bo'lsa ham: o'zgarishni telefonda so'raysiz, Claude bulutda yozadi, siz tasdiqlaysiz, sayt o'zi yangilanadi.

```
Telefon (Claude ilovasi) → bulutli seans → GitHub'da PR → siz "Merge" bosasiz → Cloudflare o'zi deploy qiladi → jonli sayt
```

## 1. Kod kerak bo'lmagan ishlar (kundalik)
Telefon brauzerida, hech narsa sozlash shart emas:
- **Do'kon paneli:** `https://gulbar.bella-rose.workers.dev/merchant`: narx, gul qo'shish/o'chirish, rasm, ish vaqti, yopish/ochish, buyurtmalar.
- **Admin paneli:** `…/admin`: do'kon qo'shish/o'chirish, login/parol tiklash, murojaatlarga javob.
- Ikkalasini ham brauzerda «Bosh ekranga qo'shing».

## 2. Bir martalik sozlash (taxminan 10 daqiqa)

### A. Claude'ni GitHub'dagi GULBAR bilan ulash
1. Telefonda Claude ilovasini oching, **Code** bo'limiga kiring (yoki brauzerda `claude.ai/code`).
2. GitHub'ni ulang va ruxsat berayotganda **Only select repositories → GULBAR** ni tanlang.
3. «Yangi seans» (New session) → repozitoriy sifatida **Samandarcodee/GULBAR** ni va **Cloud** ni tanlang.

### B. Cloudflare'da avtomatik deploy (Workers Builds)
Cloudflare saytida (telefon brauzerida «Desktop site» qulayroq):
1. `dash.cloudflare.com` → **Workers & Pages** → **gulbar** → **Settings** → **Builds**.
2. **Connect** (Git repository) → GitHub → repozitoriy **GULBAR** → ruxsatda faqat shu repoga ruxsat bering.
3. Maydonlarni to'ldiring:

| Maydon | Qiymat |
|---|---|
| Production branch | `main` |
| Build command | `npm ci && npm run check` |
| Deploy command | `npx wrangler deploy` |
| Non-production branch deploy command | `npx wrangler versions upload` |
| Build variables | `NODE_VERSION` = `24` |

4. **Create new token** (Cloudflare o'zi yaratadi), saqlang.
5. Sinab ko'rish uchun: Builds bo'limida **Retry build** yoki GitHub'ga kichik o'zgarish yuboring.

`npm run check` tiplarni, unit testlarni va build'ni tekshiradi; biror narsa yiqilsa **deploy bo'lmaydi**, eski versiya ishlayveradi.

### C. GitHub mobil ilovasi
App Store / Google Play'dan **GitHub** ni o'rnating, `Samandarcodee` hisobingiz bilan kiring. PR'ni shu ilovada ko'rib «Merge» qilasiz.

### D. (Tavsiya) main'ni himoyalash
GitHub → GULBAR → **Settings → Branches → Add rule** → `main` → **Require a pull request before merging**. Shunda hech narsa ko'rib chiqilmasdan jonli saytga chiqmaydi.

## 3. Har kungi tartib (kod o'zgartirish)
1. Claude → **Code → New session** → GULBAR + Cloud.
2. O'zgarishni oddiy tilda yozing, masalan: «Savat tugmasini kattaroq qil», «Do'kon sahifasida telefon raqami ko'rinsin».
3. Claude `claude/...` nomli shoxda o'zgartiradi, `npm run check` ni ishga tushiradi va **Pull Request** ochadi. U nima o'zgargani va nimani tekshirganini yozadi.
4. Ko'rib chiqing. Ko'rinishni tekshirish: Cloudflare shox uchun **Version URL** beradi (Builds → build → ko'rish havolasi).
   - **Diqqat:** sinov versiyasi HAQIQIY bazaga ulangan. Ko'ring, lekin sinov buyurtma bermang.
5. Yoqsa GitHub ilovasida **Merge**. 1–3 daqiqada jonli saytda chiqadi.
6. Telegram'da mini app'ni to'liq yopib qayta oching (eski versiya keshlanishi mumkin).

Yoqmasa seansda yozing: «Bunday emas, shunday qil», Claude PR'ni yangilaydi.

## 4. Ma'lumotlar bazasi o'zgarsa (migratsiya)
Bazaga yangi jadval yoki qoida qo'shilsa, Claude PR'da **«Migratsiya kerak»** deb yozadi va SQL'ni beradi. Uni **Merge'dan oldin** qo'llash kerak, aks holda yangi kod ishlamaydi.

Telefonda: Cloudflare → **Storage & Databases → D1 → gulbar-live → Console** → SQL'ni joylab **Execute**. Keyin PR'ni Merge qiling.

Migratsiyalar avtomatik qo'llanmaydi (deploy tokenida baza huquqi yo'q). Bu ataylab.

## 5. Favqulodda: orqaga qaytarish
Deploydan keyin nimadir buzilsa:
Cloudflare → Workers & Pages → **gulbar** → **Deployments** → oldingi versiyani tanlang → **Rollback**. Bir daqiqada eski versiya qaytadi.

Eslatma: orqaga qaytarish bazani qaytarmaydi. Migratsiyadan keyin qaytarsangiz, Claude'dan yordam so'rang.

## 6. Cheklovlar
- **Brauzer testlari** (Playwright) bulutli seansda odatda ishlamaydi, ular faqat kompyuterda. Bulutda `npm run check` ishlaydi. Ko'rinish o'zgarishlarini Version URL orqali o'zingiz ko'ring.
- **Eski manzil** (`flowrs-urganch…workers.dev`) avtomatik yangilanmaydi, chunki alohida Worker. Tavsiya: uni yangi manzilga yo'naltiruvchi qilib qo'yish (Claude'dan so'rang).
- **GitHub Actions** (CI) hisobingizdagi to'lov muammosi hal bo'lguncha ishlamaydi. Avto-deploy unga bog'liq emas.
- Parollar, tokenlar va kalitlarni **hech qachon** chatga yoki kodga yozmang. Ular Cloudflare'da (Settings → Variables and Secrets) turadi.
