// Fills the public Telegram profile of the GulBar bot: short bio, long description and command list (Uzbek default + Russian).
// Reads the token from the ignored server file and never prints it.
import { readFileSync } from 'node:fs';
const secrets = JSON.parse(readFileSync(new URL('../.cloudflare-secrets.json', import.meta.url), 'utf8'));
async function telegram(method, body = {}) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${secrets.TELEGRAM_BOT_TOKEN}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(`rejected ${response.status}`);
    return result.result;
  } catch { throw new Error(`Telegram ${method} failed. Check credentials and connectivity.`); }
}
const profile = {
  '': {
    short: 'Urganch gul do‘konlari: guldasta tanlang, narxni oldindan ko‘ring, yetkazib berishga buyurtma bering.',
    description: 'GulBar — Urganchdagi gul do‘konlari bir joyda.\n\n• Guldasta, atirgul va gul qutilarini rasmda ko‘rib tanlang\n• Narx va yetkazish haqi oldindan ko‘rinadi\n• Buyurtma tanlangan do‘konga Telegram orqali boradi\n• To‘lov — gul yetkazilganda\n\nBoshlash uchun pastdagi «GulBar» tugmasini yoki /start ni bosing.\nDo‘kon egalari uchun: /id — Telegram ID.',
    commands: [
      { command: 'start', description: 'GulBar ilovasini ochish' },
      { command: 'id', description: 'Do‘konni ulash uchun Telegram ID' },
      { command: 'help', description: 'Yordam' },
    ],
  },
  ru: {
    short: 'Цветочные магазины Ургенча: выберите букет, цена видна сразу, заказ с доставкой.',
    description: 'GulBar — цветочные магазины Ургенча в одном месте.\n\n• Выбирайте букеты, розы и цветочные коробки по фото\n• Цена и стоимость доставки видны заранее\n• Заказ уходит выбранному магазину через Telegram\n• Оплата — при доставке\n\nЧтобы начать, нажмите кнопку «GulBar» внизу или /start.\nДля владельцев магазинов: /id — ваш Telegram ID.',
    commands: [
      { command: 'start', description: 'Открыть GulBar' },
      { command: 'id', description: 'Telegram ID для подключения магазина' },
      { command: 'help', description: 'Помощь' },
    ],
  },
};
for (const [lang, p] of Object.entries(profile)) {
  if ([...p.short].length > 120 || [...p.description].length > 512) throw new Error(`Text too long for "${lang || 'default'}".`);
  const extra = lang ? { language_code: lang } : {};
  await telegram('setMyShortDescription', { short_description: p.short, ...extra });
  await telegram('setMyDescription', { description: p.description, ...extra });
  await telegram('setMyCommands', { commands: JSON.stringify(p.commands), ...extra });
}
for (const lang of ['', 'ru']) {
  const extra = lang ? { language_code: lang } : {};
  const [short, long, commands] = await Promise.all([telegram('getMyShortDescription', extra), telegram('getMyDescription', extra), telegram('getMyCommands', extra)]);
  console.log(JSON.stringify({ lang: lang || 'default', short: short.short_description.length + ' chars', description: long.description.length + ' chars', commands: commands.map(c => c.command) }));
}
