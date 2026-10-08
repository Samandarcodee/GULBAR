# GulBar: do‘konlarni ulash

## Siz — administrator

1. https://gulbar.bella-rose.workers.dev/admin sahifasini oching.
2. Dastlabki login va vaqtinchalik parol `.gulbar-admin-access.txt` faylida. Birinchi kirishda o‘z parolingizni qo‘ying.
3. **Yangi do‘kon** tugmasini bosing. Nom, tavsif, manzil, telefon, yetkazish haqi va muddatini kiriting.
4. Do‘kon egasi @GulBarr_bot ga `/start`, so‘ng `/id` yuborsin. Chiqqan ID’ni uning do‘koniga kiriting.
5. Har bir do‘kon uchun alohida login va kamida 12 belgili vaqtinchalik parol belgilang.
6. Saqlang va **Kirish ma’lumotlarini nusxalash** orqali panel havolasi, login va parolni egasiga xavfsiz yo‘l bilan bering. Buni dastur avtomatik yubormaydi.
7. Mahsulotlar tayyor bo‘lgach do‘konni oching. Telefon, Telegram ID, yetkazish va katalog holatini **Do‘konni tahrirlash** orqali o‘zgartirish mumkin.

Parol unutilsa **Login va parol** orqali yangi vaqtinchalik parol belgilang. Avvalgi sessiyalar yopiladi;
do‘kon egasi yangi parolni birinchi kirishda almashtiradi. Shu oynada loginni bloklash ham mumkin.
Loginni bloklash do‘konni katalogdan yashirmaydi; kerak bo‘lsa do‘konni ham yoping.

## Do‘kon egasi

1. `/merchant` sahifasida login va vaqtinchalik parol bilan kiradi.
2. O‘ziga yangi parol qo‘yadi. Admin dastlabki vaqtinchalik paroldan keyin bu parolni ko‘ra olmaydi.
3. **Gullar va narxlar → Gul qo‘shish** orqali nom, tavsif, kategoriya, narx, qoldiq va rasm havolasini kiritadi.
   Rasm hozir HTTPS havola bilan qo‘shiladi; fayl yuklash yo‘q.
4. Buyurtmalar faqat shu do‘konning panelida ko‘rinadi. Egasi qabul qiladi, yo‘lga chiqqanini belgilaydi va yetkazilganini tasdiqlaydi.
5. Bekor qilingan buyurtma gullari qoldiqqa bir marta qaytadi. Egasi mijozga telefon orqali sababini tushuntiradi.

Parollar kamida 12 belgi. Loginlar 3–40 belgi: kichik lotin harflari, raqam, nuqta, pastki chiziq yoki tire.
Kirish sessiyasi 8 soatgacha; sahifani yangilaganda qayta kirish kerak. **Chiqish** sessiyani bekor qiladi.

## Hozirgi rejim

Public GulBar `gulbar-live` haqiqiy bazasida ishlaydi. Namunaviy 3 ta do‘kon, 6 ta gul va test buyurtmalari
bu bazaga ko‘chirilmagan. Admin panelidan kiritilgan do‘kon va login hisoblari saqlangan. Xaridor buyurtma
berish uchun Telegram Mini App orqali kiradi; admin va do‘kon paneliga odatiy brauzerda login/parol bilan
kirish mumkin. Buyurtma xabarlari do‘kon uchun kiritilgan Telegram ID’ga yuboriladi. Botdagi `/start`, `/id`
va Mini App menyusi ishlaydi. Gul, narx va qoldiqni do‘kon egasi haqiqiy ma’lumot bilan kiritadi.

## Texnik sozlash

`0003_accounts.sql` migratsiyasini mahalliy va masofaviy D1 bazaga qo‘llang.
`node cloudflare/prepare-admin.mjs` maxfiy owner kaliti va dastlabki hisob ma’lumotlarini ignored fayllarda yaratadi;
`npx wrangler secret bulk .cloudflare-secrets.json` kalitlarni Workerga joylaydi.
Worker deploy qilingandan keyin `node cloudflare/bootstrap-admin.mjs` dastlabki adminni bir marta yaratadi.
Mavjud admin bo‘lsa uning parolini almashtirmaydi. Bu API ADMIN_TOKEN bilan himoyalangan.

Hisoblar admin/merchant rollari bilan bazada saqlanadi. Sessiyalar har so‘rovda rol, do‘kon, muddat va hisob
holati bo‘yicha tekshiriladi. Telegram ID ommaviy katalogga chiqarilmaydi. Admin odatda brauzer orqali ishlaydi;
Telegram sessiyasi administrator huquqini bermaydi.
