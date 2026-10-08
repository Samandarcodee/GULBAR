// Private-chat commands never trust a caller-provided shop ID or grant merchant access.
export function telegramParameters(data) {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key,
    value !== null && typeof value === 'object' ? JSON.stringify(value) : value,
  ]));
}
// Plain text only (no parse_mode), so a name can never inject markup; control characters and long names are trimmed.
const cleanName = name => typeof name === 'string' ? name.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 40) : '';
const texts = {
  uz: {
    open: 'GulBar’ni ochish',
    start: name => `Assalomu alaykum${name ? `, ${name}` : ''}! 🌷\n\nGulBar — Urganchdagi gul do‘konlari bir joyda.\n\n• Guldastalarni rasmda ko‘rib tanlang\n• Narx va yetkazish haqi oldindan ko‘rinadi\n• Buyurtma tanlangan do‘konga boradi\n• To‘lov — gul yetkazilganda\n\nBoshlash uchun pastdagi tugmani bosing.\n\nDo‘kon egasimisiz? /id buyrug‘i Telegram ID’ingizni ko‘rsatadi.`,
    help: 'Buyurtma berish juda oson:\n\n1. «GulBar’ni ochish» tugmasini bosing\n2. Kimga ekanini tanlang va yoqqan guldastani toping\n3. Savatga qo‘shib, manzil va telefon raqamini kiriting\n4. Do‘kon buyurtmani tasdiqlaydi va yetkazib beradi — to‘lov gul yetkazilganda\n\nDo‘kon egalari uchun: /id — Telegram ID’ingiz.',
    id: id => `Sizning Telegram ID: ${id}\n\nDo‘kon buyurtmalarini shu hisobga ulash uchun ushbu ID’ni GulBar administratoriga bering. Kirish kalitini hech kimga yubormang.`,
    demo: '\n\nHozir demo rejimi: test buyurtmalar yetkazilmaydi.',
  },
  ru: {
    open: 'Открыть GulBar',
    start: name => `Здравствуйте${name ? `, ${name}` : ''}! 🌷\n\nGulBar — цветочные магазины Ургенча в одном месте.\n\n• Выбирайте букеты по фото\n• Цена и доставка видны заранее\n• Заказ уходит выбранному магазину\n• Оплата — при доставке\n\nЧтобы начать, нажмите кнопку ниже.\n\nВладелец магазина? Команда /id покажет ваш Telegram ID.`,
    help: 'Заказать просто:\n\n1. Нажмите «Открыть GulBar»\n2. Выберите, кому цветы, и найдите букет\n3. Добавьте в корзину, укажите адрес и телефон\n4. Магазин подтвердит и доставит заказ — оплата при получении\n\nДля владельцев магазинов: /id — ваш Telegram ID.',
    id: id => `Ваш Telegram ID: ${id}\n\nПередайте этот ID администратору GulBar, чтобы получать заказы магазина. Никому не отправляйте ключ доступа.`,
    demo: '\n\nСейчас демо-режим: тестовые заказы не доставляются.',
  },
};
export function commandReply(message, appUrl, demo) {
  const chat = message?.chat;
  if (chat?.type !== 'private' || !Number.isSafeInteger(chat.id) || chat.id <= 0 || message.from?.id !== chat.id) return null;
  const command = /^\/(start|id|help)(?:@[a-zA-Z0-9_]+)?(?:\s|$)/.exec(message.text || '')?.[1];
  if (!command) return null;
  const t = texts[message.from?.language_code?.startsWith('ru') ? 'ru' : 'uz'];
  const mode = demo ? t.demo : '';
  const text = command === 'id' ? t.id(chat.id) : (command === 'help' ? t.help : t.start(cleanName(message.from?.first_name))) + mode;
  return { chat_id: chat.id, text, reply_markup: { inline_keyboard: [[{ text: t.open, web_app: { url: appUrl } }]] } };
}
