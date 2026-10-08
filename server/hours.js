// Shop opening hours, always in Tashkent time (UTC+5, no daylight saving). Used by the Node server, the Worker and the app.
// hours = { open: 'HH:MM', close: 'HH:MM' }. A missing/invalid value means the shop is always open.
// A close time earlier than the open time means the shop works past midnight (09:00–01:00).
const TASHKENT_OFFSET_MIN = 5 * 60;
export const toMinutes = value => {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const minuteOfDay = date => {
  const local = new Date(date.getTime() + TASHKENT_OFFSET_MIN * 60000);
  return local.getUTCHours() * 60 + local.getUTCMinutes();
};
const valid = hours => {
  if (!hours) return null;
  const open = toMinutes(hours.open), close = toMinutes(hours.close);
  return open === null || close === null || open === close ? null : { open, close };
};
export function isOpen(hours, now = new Date()) {
  const h = valid(hours);
  if (!h) return true;
  const t = minuteOfDay(now);
  return h.open < h.close ? t >= h.open && t < h.close : t >= h.open || t < h.close;
}
// The moment the shop is (next) open: `now` itself while open, otherwise the coming opening time.
export function nextOpen(hours, now = new Date()) {
  if (isOpen(hours, now)) return new Date(now);
  const h = valid(hours);
  const wait = ((h.open - minuteOfDay(now)) + 1440) % 1440 || 1440;
  return new Date(Math.floor(now.getTime() / 60000) * 60000 + wait * 60000);
}
export const hoursLabel = hours => (valid(hours) ? `${hours.open}–${hours.close}` : '');
