# GulBar — loyiha qanday ishlaydi

> Bu fayl taqdimot (PPT) tayyorlash uchun asos. Har bir `##` bo'lim — bitta slayd yoki slaydlar guruhi.
> Har bir bo'lim oxirida **«Slaydga»** bandi bor: o'sha bo'limdan slaydga nimani olish kerakligi ko'rsatilgan.

---

## 1. GulBar nima?

**GulBar** — Urganchdagi gul do'konlari uchun Telegram ichida ishlaydigan buyurtma ilovasi (Telegram Mini App).

- **Xaridor** Telegram'da botni ochadi, guldastalarni rasmda ko'radi, narxini bilib oladi va buyurtma beradi.
- **Do'kon egasi** buyurtmani Telegram'ida oladi, bir tugma bilan qabul qiladi va gulni yetkazadi.
- **To'lov** gul yetkazilganda (onlayn to'lov hozircha yo'q).

Bot: **@GulBarr_bot**
Manzil: **https://gulbar.bella-rose.workers.dev**

**Slaydga:** bitta jumla ("Urganch gul do'konlari bir joyda, Telegram ichida") + 3 ta belgi: rasmda tanlash, narx oldindan, buyurtma Telegramga.

---

## 2. Kim nima qiladi? (uch rol)

| Rol | Kim | Nima qiladi | Qayerdan kiradi |
|---|---|---|---|
| **Xaridor** | Oddiy mijoz | Gul tanlaydi, buyurtma beradi, baho qoldiradi | Telegram → bot → Mini App |
| **Do'kon egasi** | Gul do'koni | Gul va narx qo'shadi, buyurtmani qabul qiladi | Telegram (xabar) + do'kon paneli `/merchant` |
| **Administrator** | GulBar egasi | Do'kon qo'shadi, login beradi, nazorat qiladi | Admin paneli `/admin` |

**Slaydga:** uch ustunli jadval yoki uch ikonka.

---

## 3. Buyurtma yo'li (asosiy jarayon)

1. **Xaridor tanlaydi.** Guldasta, manzil, qabul qiluvchi va yetkazish vaqtini kiritadi.
2. **Buyurtma saqlanadi.** Narx serverda hisoblanadi (xaridor o'zgartira olmaydi), gullar qoldiqdan band qilinadi.
3. **Do'konga xabar boradi.** Bot do'kon egasining Telegram'iga xabar yuboradi: tarkib, manzil, telefon, vaqt, tabrik matni va ikkita tugma — **Qabul qilish** / **Bekor qilish**.
4. **Do'kon javob beradi.** «Qabul qilish» → keyin «Yo'lda» → «Yetkazildi».
5. **Xaridorga xabar boradi** har bir bosqichda.
6. **Yetkazilgach** xaridor do'konga baho beradi.

**Slaydga:** 6 qadamli gorizontal chiziq (sarlavhalar: Tanlaydi → Saqlanadi → Do'konga xabar → Javob → Xaridorga xabar → Baho).

---

## 4. Buyurtma holatlari

`Kutilmoqda → Qabul qilindi → Yo'lda → Yetkazildi`
Istalgan vaqtda (yetkazilgunga qadar): `Bekor qilindi`.

- **Bekor qilinsa** gullar qoldiqqa avtomatik qaytadi (bir marta, ortiqcha emas).
- **Do'kon 30 daqiqa javob bermasa**, buyurtma avtomatik bekor qilinadi, xaridor va do'konga xabar boradi. Vaqt sozlanadi (`PENDING_EXPIRY_MINUTES`, kamida 5 daqiqa).
- Holatlar faqat shu tartibda o'tadi; ortga qaytib bo'lmaydi.

**Slaydga:** to'rt bosqichli chiziq + ikki qoida ("Bekor qilinsa qoldiq qaytadi", "30 daqiqada javob bo'lmasa avtomatik bekor").

---

## 5. Xaridor tajribasi

- **Bosh sahifa:** do'konlar yumaloq belgilarda (hikoyalar kabi), "Kimga?" filtri (Onamga, Rafiqamga…), rasmli guldastalar tarmog'i. Narx va yetkazish haqi karta ustida ko'rinadi.
- **Guldasta oynasi:** bir nechta rasmni surib ko'rish, narx, tavsif, do'kon va uning bahosi, **Ulashish** tugmasi, **Savatga qo'shish**.
- **Do'kon sahifasi:** logotip, manzil, yetkazish haqi va muddati, qo'ng'iroq tugmasi, do'konning guldastalari va **sharhlar**.
- **Savat va buyurtma:** bitta do'kondan buyurtma. Ism, telefon va oxirgi 3 ta manzil eslab qolinadi; «Gullar o'zim uchun» tugmasi.
- **Yetkazish yoki olib ketish:** xaridor «Yetkazib berish» yoki «Do'kondan olib ketish» (yetkazish haqi 0) ni tanlaydi.
- **Aniq sana va vaqt oralig'i:** 14 kun ichidan kun va 2 soatlik oraliq tanlanadi; oraliqlar do'konning ish vaqtiga qarab o'zi cheklanadi. «Imkon qadar tezroq» faqat do'kon ochiq bo'lsa.
- **Xarita nuqtasi:** manzilni xaritada belgilash yoki «Mening joylashuvim» (ixtiyoriy). Nuqta do'kon Telegramiga xarita sifatida ham boradi. Xarita: OpenStreetMap.
- **Tabrik kartasi:** 5 ta uslub (Klassik, Atirgul, Oltin, Bahor, Minimal), tayyor tilaklar, «Kimdan» maydoni va jonli ko'rinish; do'kon kartani aynan shu ko'rinishda ko'radi.
- **Buyurtmalarim:** holat chizig'i, tanlangan vaqt, **Bekor qilish** (faqat do'kon hali qabul qilmagan buyurtma uchun; gullar do'konga qaytadi), **Baho berish**, **Qayta buyurtma**, **Shikoyat / yordam**.
- **Yordam (Profil):** tez-tez so'raladigan savollar, «Yordamga yozish» (shikoyat, savol, taklif) va o'z murojaatlari bilan javoblar. Kuniga 5 tagacha murojaat. Admin paneldagi «Murojaatlar» bo'limida javob beriladi, javob xaridorning Telegramiga ham boradi.
- **Sevimlilar**, qorong'i rejim va Telegram mavzusiga moslik.

**Slaydga:** 4–5 ta telefon ekran rasmi (bosh sahifa, guldasta oynasi, do'kon sahifasi, buyurtma) va ostida bir qator izoh.

---

## 6. Do'kon egasi uchun

**Boshlash (bir marta):**
1. Telegram'da **@GulBarr_bot** → `/start` → `/id` yozadi. Bot Telegram ID raqamini beradi.
2. ID ni administratorga beradi.
3. Administrator unga **login va vaqtinchalik parol** beradi.
4. `…/merchant` sahifasiga kiradi, **yangi parol** qo'yadi (kamida 12 belgi).

**Kundalik ish (do'kon paneli):**
- **Gul qo'shish:** rasm (telefondan), qo'shimcha rasmlar (4 tagacha), nom, tavsif, narx, qoldiq, «Kimga mos?» belgilari.
- **Qoldiq** «−» va «+» bilan bir bosishda yangilanadi.
- **Ko'rinadi / Yashirin** tugmasi: gul vaqtincha yo'q bo'lsa yashiriladi.
- **Do'kon sozlamalari:** yetkazish haqi, muddati, do'kon ochiq/yopiq.
- **Buyurtmalar:** qidirish, holat bo'yicha filtr, bugungi ko'rsatkichlar.
- **Asosiy ish Telegram'da:** buyurtma xabari kelganda «Qabul qilish» tugmasini bosish yetarli.

**Slaydga:** "Boshlash — 4 qadam" va "Kundalik — 4 amal".

---

## 7. Administrator uchun

- **Yangi do'kon qo'shish:** nom, tavsif, manzil, telefon, yetkazish haqi/muddati, Telegram ID. Do'kon ID'si, rang va bosh harflar o'zi hosil bo'ladi.
- **Login va parol:** «Yaratish» tugmasi kuchli parol beradi. Parol bir marta ko'rsatiladi; «Kirish ma'lumotlarini nusxalash» tugmasi bilan do'kon egasiga yuboriladi.
- **Mavjud do'konga login qo'shish** (login yo'q do'konlar uchun) mumkin.
- **Tayyorlik ko'rsatkichi:** har bir do'kon kartasida 4 qadam (telefon, Telegram, login, gullar) va «Keyingi qadam» yozuvi. Hammasi tayyor bo'lsa «Buyurtma qabul qila oladi».
- **Filtr va qidiruv:** Hammasi / Tayyor emas / Tayyor.
- **Hisobni boshqarish:** parolni tiklash, loginni bloklash (sessiyalar yopiladi).
- **Do'konni o'chirish:** do'kon kartasidagi «O'chirish» tugmasi. Tasdiqlash uchun do'kon nomini yozish kerak. Do'kon, gullari, rasmlari, sharhlari va egasining logini o'chadi, egasi tizimdan chiqib ketadi. Oldingi buyurtmalar xaridorlarda tarix sifatida qoladi. Tugallanmagan buyurtma (kutilmoqda, qabul qilindi, yo'lda) bo'lsa o'chirish rad etiladi. Qaytarib bo'lmaydi; vaqtincha yopish uchun «Do'konni katalogda ochish» belgisini olib tashlang.

**Slaydga:** admin panelining ekrani va "Do'konni ulash — 4 qadam".

---

## 8. Sharhlar va ishonch

- Sharh **faqat yetkazilgan buyurtma egasi** tomonidan, **bir buyurtmaga bitta** qoldiriladi (soxta sharh yo'q).
- 1–5 yulduz va ixtiyoriy matn (500 belgigacha).
- Ommaga **faqat ismning birinchi so'zi** ko'rinadi (telefon va manzil hech qachon).
- Do'konning o'rtacha bahosi bosh sahifa kartalarida, guldasta oynasida va do'kon sahifasida chiqadi.
- Yetkazilgach bot xaridorga «Baho berish» tugmali xabar yuboradi.

**Slaydga:** yulduzlar va "faqat haqiqiy xaridorlar" so'zi.

---

## 9. Telegram xabarlari

| Kimga | Qachon | Mazmuni |
|---|---|---|
| Do'konga | Yangi buyurtma | Tarkib, manzil, telefon, vaqt, tabrik, **Qabul/Bekor** tugmalari |
| Xaridorga | Qabul qilindi | "Buyurtmangiz qabul qilindi", jami summa |
| Xaridorga | Yo'lda | "Buyurtmangiz yo'lda" |
| Xaridorga | Yetkazildi | Rahmat va **Baho berish** tugmasi |
| Xaridorga | Bekor qilindi | Sabab va do'kon telefoni (bo'lsa) |
| Ikkalasiga | 30 daqiqa javob yo'q | Avtomatik bekor qilish haqida |

Eslatma: bot xaridorga faqat u botni ochgan bo'lsa yoza oladi (Telegram qoidasi).

**Slaydga:** xabarlar jadvali yoki 2–3 ta xabar rasmi.

---

## 10. Xavfsizlik va ma'lumotlar

- Xaridor Telegram orqali **imzolangan** sessiya bilan kiradi; buyurtma faqat shu orqali beriladi.
- **Narx va qoldiq serverda** hisoblanadi, xaridor o'zgartira olmaydi.
- Parollar kuchli usulda (PBKDF2) saqlanadi; sessiyalar 8 soat; hisob bloklansa sessiyalar yopiladi.
- Do'konning **Telegram ID'si ommaga ko'rsatilmaydi**; do'kon telefoni esa xaridor qo'ng'iroq qilishi uchun ko'rinadi.
- Rasmlar turi tekshiriladi (JPG, PNG, WebP, 1 MB gacha).
- So'rovlar soni cheklangan (suiiste'moldan himoya).

**Slaydga:** 4 ta qisqa belgi: Imzolangan kirish, Narx serverda, Parollar himoyalangan, Maxfiy ma'lumotlar yashirin.

---

## 11. Texnik tuzilma (oddiy tilda)

```
Xaridor (Telegram Mini App)  ─┐
Do'kon egasi (Telegram + panel) ├─►  Cloudflare Worker  ─►  Ma'lumotlar bazasi (D1)
Administrator (admin panel) ──┘            │
                                           └─►  Telegram Bot API (xabarlar)
```

- **Ilova (frontend):** React + Vite, animatsiyalar uchun Motion.
- **Server:** Cloudflare Worker (Hono). Har daqiqada ishlaydigan vazifa: xabarlarni qayta yuborish va javobsiz buyurtmalarni bekor qilish.
- **Baza:** Cloudflare D1 (SQLite). Qoldiq va holat qoidalari bazaning o'zida (triggerlar) bajariladi, shuning uchun ortiqcha sotish bo'lmaydi.
- **Bot:** @GulBarr_bot, vebhuk orqali ishlaydi.
- **Manzillar:** asosiy `gulbar.bella-rose.workers.dev`, eski `flowrs-urganch…` ham ishlaydi (bir xil baza).

**Slaydga:** yuqoridagi sxema.

---

## 12. Hozirgi holat

**Tayyor:** katalog, buyurtma, Telegram xabarlari, do'kon va admin paneli, sharhlar, do'kon sahifasi, avtomatik bekor qilish, ikki tilli bot matni.

**Hozircha yo'q:** onlayn to'lov, Mini App ichida rus tili, o'z domen, xarita.

**Eslatma:** narxlar va yetkazish shartlari demo bo'lgan do'konlar (Madina Gullari, Gold Flowers, So'nya Gullari) uchun haqiqiy ma'lumot bilan almashtirilishi kerak.

**Slaydga:** "Tayyor / Keyingi" ikki ustun.

---

## 13. Keyingi qadamlar

1. Do'konlardan Telegram ID, haqiqiy narx va rasm olish.
2. Har bir do'konga login berish.
3. Birinchi sinov buyurtmasi (xabar kelishini tekshirish).
4. Zaxira (git) va o'z domen.
5. Kichik, shaxsiy reklama; keyin kengaytirish.

**Slaydga:** raqamlangan 5 qadam.

---

## Taqdimot uchun tavsiya

- **12–14 slayd**, har bir bo'lim = 1 slayd (3, 5, 6-bo'limlarni 2 slaydga bo'lish mumkin).
- **Uslub:** qora-oq, bitta bezak rangi (kraft qog'oz `#D9B987`), sarlavha uchun Fraunces/Cambria, matn uchun Onest/Calibri.
- **Ekran rasmlari:** loyiha ichidagi `docs/` va `test-results/` papkalaridan olinadi.
- **Eng muhim 3 xabar:** 1) narx va yetkazish oldindan ko'rinadi; 2) buyurtma bevosita Telegram'ga keladi; 3) hammasi bitta tugma bilan boshqariladi.
