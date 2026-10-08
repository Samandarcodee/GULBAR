import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, ChevronDown, Clock3, HelpCircle, LifeBuoy, Lightbulb, MessageCircle, TriangleAlert } from 'lucide-react';
import type { Order } from '../types';
import { api, haptic } from '../lib/api';
import { Dialog } from './Dialog';

export type Ticket = { id: string; kind: 'complaint' | 'question' | 'suggestion'; message: string; orderId: string | null; status: 'new' | 'done'; reply: string; createdAt: string };
const kinds = [
  { id: 'complaint', label: 'Shikoyat', icon: TriangleAlert, hint: 'Buyurtma yoki xizmat bilan muammo' },
  { id: 'question', label: 'Savol', icon: HelpCircle, hint: 'Nimadir tushunarsiz' },
  { id: 'suggestion', label: 'Taklif', icon: Lightbulb, hint: 'Ilovani yaxshilash uchun fikr' },
] as const;
const faq = [
  ['Buyurtmani qanday bekor qilaman?', 'Buyurtmalar sahifasida, do‘kon hali qabul qilmagan buyurtma ostida «Bekor qilish» tugmasi bor. Do‘kon qabul qilgach, uni do‘kon telefoni orqali bekor qilasiz.'],
  ['To‘lov qachon va qanday?', 'To‘lov gul yetkazilganda yoki do‘kondan olib ketganda, do‘konning o‘ziga to‘lanadi. Ilovada hozircha onlayn to‘lov yo‘q.'],
  ['Do‘kon javob bermasa nima bo‘ladi?', '30 daqiqa ichida javob bo‘lmasa, buyurtma avtomatik bekor qilinadi va sizga xabar keladi. Do‘kon yopiq bo‘lsa, vaqt do‘kon ochilganda boshlanadi.'],
  ['Yetkazish haqi nima uchun do‘konga qarab o‘zgaradi?', 'Har bir do‘kon yetkazishni o‘zi amalga oshiradi va narxni o‘zi belgilaydi. Savatda haq oldindan ko‘rinadi.'],
  ['Telefon va manzilim kimga ko‘rinadi?', 'Faqat buyurtma bergan do‘konga. Sharhlarda faqat ismingizning birinchi so‘zi ko‘rinadi.'],
];
const stamp = (iso: string) => new Date(iso).toLocaleDateString('uz-UZ', { timeZone: 'Asia/Tashkent' });

export function SupportDialog({ order, onClose, onDone }: { order?: Order | null; onClose: () => void; onDone: () => void }) {
  const [kind, setKind] = useState<Ticket['kind']>(order ? 'complaint' : 'question');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (message.trim().length < 5) { setError('Xabar kamida 5 belgidan iborat bo‘lsin.'); return; }
    setBusy(true); setError('');
    try { await api('/support', { method: 'POST', body: JSON.stringify({ kind, message, ...(order ? { orderId: order.id } : {}) }) }); onDone(); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  return <Dialog title="Yordam va shikoyat" onClose={() => { if (!busy) onClose(); }}>
    <form className="support-form" onSubmit={submit} noValidate>
      {order && <p className="support-order">Buyurtma #{order.id.slice(0, 8)} · {order.shopName}</p>}
      <div className="kind-chips" role="radiogroup" aria-label="Murojaat turi">{kinds.map(k => { const Icon = k.icon; return <button type="button" key={k.id} role="radio" aria-checked={kind === k.id} className={kind === k.id ? 'on' : ''} onClick={() => { haptic(); setKind(k.id); }}><Icon size={18} aria-hidden="true" /><b>{k.label}</b><small>{k.hint}</small></button>; })}</div>
      <label className="field">Xabaringiz<textarea value={message} onChange={e => setMessage(e.target.value)} maxLength={1000} rows={5} placeholder={kind === 'complaint' ? 'Nima bo‘ldi? Qachon va qayerda?' : kind === 'question' ? 'Savolingizni yozing' : 'Fikringizni yozing'} /></label>
      <p className="field-help">{message.length}/1000 · Javob shu yerda va Telegramda keladi.</p>
      {error && <p className="error-banner" role="alert">{error}</p>}
      <button className="primary full" disabled={busy}>{busy ? 'Yuborilmoqda…' : 'Yuborish'}</button>
    </form>
  </Dialog>;
}

/** Profile page: how-to answers, a button to write to support and the buyer's own tickets with replies. */
export function HelpPanel({ refreshKey, write }: { refreshKey: number; write: () => void }) {
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => { try { setTickets(await api<Ticket[]>('/support')); setFailed(false); } catch { setFailed(true); } }, []);
  useEffect(() => { void load(); }, [load, refreshKey]);
  return <section className="help-panel" aria-labelledby="help-h">
    <div className="help-head"><LifeBuoy size={22} aria-hidden="true" /><h2 id="help-h">Yordam</h2></div>
    <div className="faq">{faq.map(([q, a]) => <details key={q}><summary>{q}<ChevronDown size={18} aria-hidden="true" /></summary><p>{a}</p></details>)}</div>
    <button className="primary full" onClick={write}><MessageCircle size={18} /> Yordamga yozish</button>
    {failed && <p className="muted">Murojaatlaringizni yuklab bo‘lmadi.</p>}
    {tickets && tickets.length > 0 && <div className="tickets"><h3>Murojaatlaringiz</h3>{tickets.map(t => <motion.article key={t.id} className="ticket" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .35 }}>
      <header><b>{kinds.find(k => k.id === t.kind)?.label}</b><span className={`ticket-state ${t.status}`}>{t.status === 'done' ? <><CheckCircle2 size={13} /> Javob berildi</> : <><Clock3 size={13} /> Ko‘rib chiqilmoqda</>}</span><time dateTime={t.createdAt}>{stamp(t.createdAt)}</time></header>
      <p>{t.message}</p>
      {t.reply && <p className="ticket-reply"><b>GulBar javobi:</b> {t.reply}</p>}
    </motion.article>)}</div>}
  </section>;
}
