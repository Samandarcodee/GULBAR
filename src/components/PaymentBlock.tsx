import { useState } from 'react';
import { BadgeCheck, Banknote, Check, Clock3, Copy, CreditCard, Hourglass, Phone, RotateCcw } from 'lucide-react';
import type { Order, Shop } from '../types';
import { api, haptic, money } from '../lib/api';
import { useNow } from '../lib/hours-ui';
import { formatCard } from '../../server/payment.js';

/** Everything about paying a card-transfer order, in the order card: waiting, card details, "I paid", confirmed, refund. */
export function PaymentBlock({ order, shop, changed }: { order: Order; shop?: Shop; changed: () => void }) {
  const pay = order.payment;
  const now = useNow().getTime();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  if (pay?.method !== 'card') return null;
  const phone = shop?.phone;
  const call = phone ? <a className="pay-phone" href={`tel:${phone}`}><Phone size={14} aria-hidden="true" /> {phone}</a> : null;

  if (order.status === 'cancelled') {
    if (order.refundDue) return <div className="pay-block warn"><RotateCcw size={18} aria-hidden="true" /><div><b>Pulingiz qaytariladi</b><p>To‘lov tasdiqlangan edi, buyurtma esa bekor bo‘ldi. Do‘kon pulni kartangizga qaytarishi kerak. {call}</p></div></div>;
    if (pay.refundedAt) return <div className="pay-block ok"><BadgeCheck size={18} aria-hidden="true" /><div><b>Pul qaytarildi</b></div></div>;
    return null;
  }
  if (order.status === 'pending') return <div className="pay-block"><CreditCard size={18} aria-hidden="true" /><div><b>Kartaga o‘tkazma bilan to‘lanadi</b><p>Do‘kon buyurtmani qabul qilgach, shu yerda karta raqami paydo bo‘ladi.</p></div></div>;
  if (pay.status === 'confirmed') return <div className="pay-block ok"><BadgeCheck size={18} aria-hidden="true" /><div><b>To‘lov tasdiqlandi</b>{order.deliveryFee > 0 && order.status !== 'delivered' && <p>Yo‘l haqi {money(order.deliveryFee)} haydovchiga naqd beriladi.</p>}</div></div>;

  const info = order.payInfo;
  if (!info) return null;
  const left = Math.max(0, Math.ceil((info.dueAt - now) / 60000));
  async function claim() {
    setBusy(true); setError('');
    try { await api(`/orders/${order.id}/payment`, { method: 'POST', body: JSON.stringify({ note }) }); haptic(); changed(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(info!.card); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setError('Nusxalab bo‘lmadi. Raqamni qo‘lda yozib oling.'); }
  }
  if (info.state === 'claimed') return <div className="pay-block"><Hourglass size={18} aria-hidden="true" /><div><b>Do‘kon to‘lovni tekshirmoqda</b><p>«To‘ladim» deb yozdingiz. Do‘kon pul tushganini tasdiqlagach buyurtma tayyorlanadi. {call}</p></div></div>;

  return <div className="pay-block due" role="group" aria-label="Kartaga to‘lash">
    <div className="pay-head"><CreditCard size={18} aria-hidden="true" /><b>Gullar uchun {money(info.amount)} to‘lang</b></div>
    {order.payment?.rejectedAt && <p className="pay-warn">Do‘kon to‘lovni ko‘rmadi. O‘tkazmani tekshirib, qayta «To‘ladim» ni bosing. {call}</p>}
    <div className="pay-card">
      <span className="pay-number">{formatCard(info.card)}</span>
      <button type="button" className="pay-copy" onClick={copy} aria-label="Karta raqamini nusxalash">{copied ? <><Check size={15} /> Nusxalandi</> : <><Copy size={15} /> Nusxalash</>}</button>
    </div>
    <p className="pay-meta">{info.holder}{info.bank ? ` · ${info.bank}` : ''}</p>
    <p className="pay-time"><Clock3 size={14} aria-hidden="true" /> {left > 0 ? `${left} daqiqa ichida to‘lang, aks holda buyurtma bekor bo‘ladi` : 'Muddat tugayapti. Tezroq to‘lang'}</p>
    {info.cash > 0 && <p className="pay-cash"><Banknote size={14} aria-hidden="true" /> Yo‘l haqi {money(info.cash)}: haydovchiga naqd</p>}
    <label className="field pay-note">Qaysi kartadan o‘tkazdingiz? <span className="optional">(ixtiyoriy, oxirgi 4 raqam)</span>
      <input value={note} onChange={e => setNote(e.target.value.replace(/[^\d\s]/g, '').slice(0, 9))} inputMode="numeric" placeholder="4521" maxLength={9} />
    </label>
    {error && <p className="error-banner" role="alert">{error}</p>}
    <button className="primary full" disabled={busy} onClick={claim}>{busy ? 'Yuborilmoqda…' : 'To‘ladim'}</button>
  </div>;
}
