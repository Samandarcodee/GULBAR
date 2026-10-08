import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Banknote, CreditCard, Truck, Car } from 'lucide-react';
import type { Order } from '../types';
import { api, money } from '../lib/api';
import { formatCard } from '../../server/payment.js';

type Settings = { acceptsCard: boolean; delivery: 'own' | 'taxi'; card: { number: string; holder: string; bank: string } | null };

/** Merchant settings: take card transfers, and who delivers (own courier or a taxi). The card stays private to this shop. */
export function PaymentSettings({ shopId, token, onSaved }: { shopId: string; token: string; onSaved: () => void }) {
  const [accepts, setAccepts] = useState(false);
  const [delivery, setDelivery] = useState<'own' | 'taxi'>('own');
  const [number, setNumber] = useState('');
  const [holder, setHolder] = useState('');
  const [bank, setBank] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    api<Settings>(`/merchant/${shopId}/payment`, {}, token).then(s => {
      if (!live) return;
      setAccepts(s.acceptsCard); setDelivery(s.delivery);
      setNumber(s.card ? formatCard(s.card.number) : ''); setHolder(s.card?.holder || ''); setBank(s.card?.bank || ''); setReady(true);
    }).catch(e => { if (live) setError((e as Error).message); });
    return () => { live = false; };
  }, [shopId, token]);
  const taxi = delivery === 'taxi';
  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const raw = number.replace(/\s/g, '');
      await api(`/merchant/${shopId}/payment`, { method: 'PUT', body: JSON.stringify({ acceptsCard: accepts || taxi, delivery, ...(raw ? { card: { number: raw, holder, bank } } : {}) }) }, token);
      setNotice('To‘lov sozlamalari saqlandi.'); onSaved();
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  if (!ready && !error) return null;
  return <form className="merchant-settings product-form merchant-pay" onSubmit={save}>
    <h2>To‘lov va yetkazish usuli</h2>
    <fieldset className="co-section"><legend>Kim yetkazadi?</legend>
      <div className="method-toggle" role="radiogroup" aria-label="Yetkazish usuli">
        <button type="button" role="radio" aria-checked={!taxi} className={!taxi ? 'on' : ''} onClick={() => setDelivery('own')}><Truck size={20} aria-hidden="true" /><b>O‘z kuryerim</b><small>Naqd yoki karta</small></button>
        <button type="button" role="radio" aria-checked={taxi} className={taxi ? 'on' : ''} onClick={() => { setDelivery('taxi'); setAccepts(true); }}><Car size={20} aria-hidden="true" /><b>Taksi bilan</b><small>Gullar oldindan kartaga</small></button>
      </div>
      <p className="field-help">{taxi ? 'Taksi haydovchisiga faqat yo‘l haqi naqd beriladi. Gullar pulini xaridor oldindan sizning kartangizga o‘tkazadi.' : 'Mijoz gullar pulini kuryeringizga naqd yoki oldindan kartangizga to‘lashi mumkin.'}</p>
    </fieldset>
    <label className="merchant-checkbox"><input type="checkbox" checked={accepts || taxi} disabled={taxi} onChange={e => setAccepts(e.target.checked)} /> Kartaga o‘tkazmani qabul qilaman</label>
    {(accepts || taxi) && <>
      <label className="field">Karta raqami<input value={number} onChange={e => setNumber(formatCard(e.target.value.replace(/\D/g, '').slice(0, 16)))} inputMode="numeric" autoComplete="off" placeholder="8600 0000 0000 0000" maxLength={19} /></label>
      <div className="form-grid">
        <label className="field">Karta egasi<input value={holder} onChange={e => setHolder(e.target.value)} maxLength={60} placeholder="Ism Familiya" /></label>
        <label className="field">Bank <span className="optional">(ixtiyoriy)</span><input value={bank} onChange={e => setBank(e.target.value)} maxLength={40} placeholder="Uzum Bank" /></label>
      </div>
      <p className="field-help">Karta ochiq katalogda ko‘rinmaydi. Xaridor uni faqat siz buyurtmani qabul qilgandan keyin ko‘radi. Har bir o‘zgarish administratorga xabar qilinadi.</p>
    </>}
    {error && <p className="error-banner" role="alert">{error}</p>}
    {notice && <p className="merchant-notice" role="status">{notice}</p>}
    <button className="primary" disabled={busy}>{busy ? 'Saqlanmoqda…' : 'To‘lov sozlamalarini saqlash'}</button>
  </form>;
}

/** Payment part of a shop's order card: what is owed, and the buttons to answer "did the money arrive?". */
export function OrderPayment({ order, shopId, token, busy, onDone }: { order: Order; shopId: string; token: string; busy: boolean; onDone: () => void }) {
  const pay = order.payment;
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const pickup = order.delivery?.method === 'pickup';
  if (pay?.method !== 'card') return <p className="pay-line"><Banknote size={15} aria-hidden="true" /> To‘lov: {pickup ? 'olib ketganda naqd' : 'yetkazilganda naqd'}</p>;
  async function decide(action: 'confirm' | 'reject' | 'refunded') {
    setWorking(true); setError('');
    try { await api(`/merchant/${shopId}/orders/${order.id}/payment`, { method: 'POST', body: JSON.stringify({ action }) }, token); onDone(); }
    catch (e) { setError((e as Error).message); } finally { setWorking(false); }
  }
  const off = busy || working;
  const lines: string[] = [];
  let actions: ReactNode = null;
  if (order.status === 'pending') lines.push('Kartaga o‘tkazma. Qabul qilsangiz, mijozga kartangiz ko‘rsatiladi.');
  else if (order.status === 'cancelled') {
    if (order.refundDue) { lines.push(`Pulni mijozga qaytaring: ${money(order.subtotal)}`); actions = <button className="primary" disabled={off} onClick={() => decide('refunded')}>Qaytardim</button>; }
    else if (pay.refundedAt) lines.push('Pul mijozga qaytarilgan.');
    else lines.push('To‘lov olinmagan.');
  } else if (pay.status === 'confirmed') lines.push(`To‘lov tasdiqlandi: ${money(order.subtotal)}`);
  else if (order.status === 'accepted') {
    lines.push(pay.status === 'claimed' ? `Mijoz «To‘ladim» dedi${pay.note ? ` (karta ${pay.note})` : ''}. Bank ilovangizda ${money(order.subtotal)} tushganini tekshiring.` : `Mijoz ${money(order.subtotal)} to‘lashini kutyapmiz. Pul tushsa, tasdiqlang.`);
    actions = <div className="order-actions"><button className="primary" disabled={off} onClick={() => decide('confirm')}>Pul tushdi</button>{pay.status === 'claimed' && <button className="secondary" disabled={off} onClick={() => decide('reject')}>Tushmadi</button>}</div>;
  }
  if (order.deliveryFee > 0 && order.status !== 'cancelled') lines.push(`Yo‘l haqi ${money(order.deliveryFee)}: haydovchiga naqd.`);
  return <div className={`pay-line card${pay.status === 'confirmed' ? ' ok' : ''}`}>
    <CreditCard size={15} aria-hidden="true" />
    <div>{lines.map(l => <p key={l}>{l}</p>)}{error && <p className="error-banner" role="alert">{error}</p>}{actions}</div>
  </div>;
}

export const needsPayment = (order: Order, next: string) => order.payment?.method === 'card' && order.payment.status !== 'confirmed' && ['delivering', 'delivered'].includes(next);
