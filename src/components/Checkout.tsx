import { lazy, Suspense, useMemo, useRef, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Truck, Minus, Plus, Trash2, ArrowRight, ShieldCheck, CheckCircle2, History, MapPin, Store, Clock3, X, CreditCard, Banknote } from 'lucide-react';
import type { CartItem, Catalog, Customer, Delivery, Order } from '../types';
import { api, haptic, money, readStored, writeStored } from '../lib/api';
import { Dialog } from './Dialog';
import { PhoneField, TextField } from './Field';
import { phoneMessage } from '../../server/phone.js';
import { GreetingCard, cardName, styles } from './GreetingCard';
import { shopStatus, useNow } from '../lib/hours-ui';
import { addDays, cardTemplates, dayLabel, slotOptions, tashkentDate, validateDelivery, MAX_DAYS } from '../../server/delivery.js';
import type { Point } from './MapPicker';

const MapPicker = lazy(() => import('./MapPicker'));
type Saved = { name: string; phone: string; cardStyle?: string };
type Place = { recipient: string; recipientPhone: string; address: string; point?: Point };
// what is wrong with a field, said so the buyer knows how to fix it (empty text means fine)
function fieldMessage(name: string, value: string): string {
  if (name === 'phone' || name === 'recipientPhone') return phoneMessage(value);
  if (name === 'name') return value.trim().length < 2 ? 'Ismingizni yozing, masalan: Dilnoza Karimova.' : '';
  if (name === 'recipient') return value.trim().length < 2 ? 'Qabul qiluvchining ismini yozing.' : '';
  if (name === 'address') return value.trim().length < 8 ? 'Manzilni to‘liqroq yozing: ko‘cha, uy raqami va mo‘ljal.' : '';
  return '';
}
type Choice = { when: 'asap' } | { when: 'slot'; date: string; from: string; to: string };

export function Checkout({ cart, catalog, notes = [], dismissNotes, change, onClose, complete }: { cart: CartItem[]; catalog: Catalog; notes?: string[]; dismissNotes?: () => void; change: (id: string, delta: number) => void; onClose: () => void; complete: (order: Order) => void }) {
  const saved = readStored<Partial<Saved>>('flowrs-customer', {});
  const places = readStored<unknown>('flowrs-places', []);
  const recent: Place[] = Array.isArray(places) ? places.filter((p): p is Place => !!p && typeof p.address === 'string' && typeof p.recipient === 'string').slice(0, 3) : [];
  const entries = cart.map(item => ({ item, product: catalog.products.find(p => p.id === item.productId)! })).filter(e => e.product);
  const shop = catalog.shops.find(s => s.id === entries[0]?.product.shopId);
  const now = useNow();
  const status = shopStatus(shop, now);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [self, setSelf] = useState(false);
  const [method, setMethod] = useState<'delivery' | 'pickup'>('delivery');
  const [point, setPoint] = useState<Point | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [payPref, setPayPref] = useState<'cash' | 'card'>(shop?.delivery === 'taxi' ? 'card' : 'cash');
  const key = useRef(crypto.randomUUID());
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [customer, setCustomer] = useState<Customer>({
    name: saved.name || window.Telegram?.WebApp.initDataUnsafe?.user?.first_name || '', phone: saved.phone || '+998',
    recipient: '', recipientPhone: '+998', address: '', deliveryTime: 'soon', note: '', anonymous: false, cardStyle: saved.cardStyle || 'classic', cardFrom: '',
  });
  // the first time that can be chosen: as soon as possible while the shop is open, otherwise the first free window
  const firstChoice = (m: 'delivery' | 'pickup'): Choice | null => {
    if (!shop) return null;
    if (validateDelivery({ method: m, when: 'asap' }, shop, now).ok) return { when: 'asap' };
    for (let i = 0; i <= MAX_DAYS; i++) {
      const date = addDays(tashkentDate(now), i);
      const found = slotOptions(shop, date, m, now).find(s => s.ok);
      if (found) return { when: 'slot', date, from: found.from, to: found.to };
    }
    return null;
  };
  const [choice, setChoice] = useState<Choice | null>(() => firstChoice('delivery'));
  const today = tashkentDate(now);
  const days = useMemo(() => Array.from({ length: MAX_DAYS + 1 }, (_, i) => addDays(today, i)), [today]);
  const [date, setDate] = useState(() => (choice && choice.when === 'slot' ? choice.date : today));
  const windows = shop ? slotOptions(shop, date, method, now) : [];
  const asapOk = !!shop && validateDelivery({ method, when: 'asap' }, shop, now).ok;
  const subtotal = entries.reduce((sum, e) => sum + e.product.price * e.item.quantity, 0);
  const fee = method === 'pickup' ? 0 : shop?.deliveryFee || 0;
  const total = subtotal + fee;
  // card transfer pays the flowers; the ride is always cash for the driver. A taxi shop wants the flowers paid in advance.
  const canCard = !!shop?.acceptsCard;
  const mustCard = canCard && shop?.delivery === 'taxi' && method === 'delivery';
  const pay: 'cash' | 'card' = !canCard ? 'cash' : mustCard ? 'card' : payPref;
  // the general "check the marked fields" banner has done its job as soon as the buyer starts fixing them
  const update = (name: keyof Customer, value: string | boolean) => { setCustomer(c => ({ ...c, [name]: value })); setError(e => e === 'Belgilangan maydonlarni tekshiring.' ? '' : e); setFields(f => ({ ...f, [name]: '' })); };
  // checked when the buyer leaves a field they have started to fill; empty fields are reported on send, not while tabbing past them
  const check = (name: 'name' | 'phone' | 'recipient' | 'recipientPhone' | 'address') => {
    const value = customer[name];
    if (!value.trim() || value === '+998') return;
    setFields(f => ({ ...f, [name]: fieldMessage(name, value) }));
  };
  const usePlace = (p: Place) => { haptic(); setSelf(false); setPoint(p.point || null); setCustomer(c => ({ ...c, recipient: p.recipient, recipientPhone: p.recipientPhone, address: p.address })); setFields({}); };
  const pickMethod = (m: 'delivery' | 'pickup') => {
    haptic(); setMethod(m); setFields({});
    // a time that was valid for one method is re-checked for the other
    if (shop && choice) {
      const ok = choice.when === 'asap' ? validateDelivery({ method: m, when: 'asap' }, shop, now).ok : validateDelivery({ method: m, ...choice }, shop, now).ok;
      if (!ok) setChoice(firstChoice(m));
    }
  };
  const chosenText = choice ? (choice.when === 'asap' ? 'Imkon qadar tezroq' : `${dayLabel(choice.date, now)}, ${choice.from}–${choice.to}`) : '';

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !shop || !entries.length) return;
    const pickup = method === 'pickup';
    const asSelf = self || pickup;
    const data: Customer = { ...customer, ...(asSelf ? { recipient: customer.name, recipientPhone: customer.phone } : {}), ...(pickup ? { address: shop.address } : {}), cardFrom: customer.anonymous ? '' : (customer.cardFrom || '').trim() || customer.name };
    const errors: Record<string, string> = {};
    const need = (name: 'name' | 'phone' | 'recipient' | 'recipientPhone' | 'address') => { const message = fieldMessage(name, data[name]); if (message) errors[name] = message; };
    need('name'); need('phone');
    if (!pickup && !asSelf) { need('recipient'); need('recipientPhone'); }
    if (!pickup) need('address');
    // the first field that needs attention gets the cursor, so a long form never leaves the buyer searching for it
    if (Object.keys(errors).length) { setFields(errors); setError('Belgilangan maydonlarni tekshiring.'); setTimeout(() => document.querySelector<HTMLElement>('#checkout [aria-invalid="true"]')?.focus(), 0); return; }
    if (!choice) { setError('Yetkazish vaqtini tanlang.'); setTimeout(() => errorRef.current?.focus(), 0); return; }
    const delivery: Delivery = { method, ...choice, ...(!pickup && point ? { point } : {}) } as Delivery;
    const checked = validateDelivery(delivery, shop, new Date());
    if (!checked.ok) { setError(checked.error); setTimeout(() => errorRef.current?.focus(), 0); return; }
    setBusy(true); setError('');
    try {
      const order = await api<Order>('/orders', { method: 'POST', body: JSON.stringify({ requestKey: key.current, shopId: shop.id, items: entries.map(e => e.item), customer: { ...data, deliveryTime: checked.legacy }, delivery, payment: { method: pay } }) });
      // remember who is ordering and the last few places so the next order takes seconds
      writeStored('flowrs-customer', { name: data.name, phone: data.phone, cardStyle: data.cardStyle } satisfies Saved);
      if (!asSelf) writeStored('flowrs-places', [{ recipient: data.recipient, recipientPhone: data.recipientPhone, address: data.address, ...(point ? { point } : {}) }, ...recent.filter(p => p.address !== data.address)].slice(0, 3));
      complete(order);
    } catch (e) { setError((e as Error).message); setTimeout(() => errorRef.current?.focus(), 0); }
    finally { setBusy(false); }
  }
  const pickup = method === 'pickup';
  return <Dialog title={step === 0 ? 'Sizning savatingiz' : 'Buyurtma ma’lumotlari'} onClose={() => { if (!busy) onClose(); }}>
    {catalog.demo && <p className="demo-note">Demo buyurtma — haqiqiy do‘konga yuborilmaydi.</p>}
    {notes.length > 0 && <div className="cart-notes" role="status"><b>Savat yangilandi</b><ul>{notes.map(n => <li key={n}>{n}</li>)}</ul>{dismissNotes && <button type="button" className="text-button" onClick={dismissNotes}>Tushunarli</button>}</div>}
    {!entries.length ? <div className="empty"><Truck size={38} /><h3>Savat hali bo‘sh</h3><p>Yoqtirgan guldastangizni tanlang.</p><button className="primary" onClick={onClose}>Gullarni ko‘rish</button></div> : <>
      <motion.div key={step} initial={{ opacity: 0, x: step ? 28 : -28 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: .26, ease: [0.22, 1, 0.36, 1] }}>
      {step === 0 ? <><p className="cart-shop">{shop?.name} <span>· bitta do‘kondan buyurtma</span></p><div className="cart-items"><AnimatePresence initial={false}>{entries.map(({ item, product }) => <motion.div layout className="cart-item" key={product.id} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} transition={{ duration: .25 }}>
        <img src={product.image} alt={product.name} /><div><h3>{product.name}</h3><p>{money(product.price)}</p><div className="quantity"><button onClick={() => change(product.id, -1)} aria-label={`${product.name}: kamaytirish`}>{item.quantity === 1 ? <Trash2 size={15} /> : <Minus size={15} />}</button><span>{item.quantity}</span><button onClick={() => change(product.id, 1)} disabled={item.quantity >= product.stock} aria-label={`${product.name}: ko‘paytirish`}><Plus size={15} /></button></div></div>
      </motion.div>)}</AnimatePresence></div></> : <form id="checkout" onSubmit={submit} noValidate>
        {error && <p className="error-banner" role="alert" tabIndex={-1} ref={errorRef}>{error}</p>}

        <fieldset className="co-section"><legend>Qanday olasiz?</legend>
          <div className="method-toggle" role="radiogroup" aria-label="Qanday olasiz?">
            <button type="button" role="radio" aria-checked={!pickup} className={!pickup ? 'on' : ''} onClick={() => pickMethod('delivery')}><Truck size={20} aria-hidden="true" /><b>Yetkazib berish</b><small>{money(shop?.deliveryFee || 0)}</small></button>
            <button type="button" role="radio" aria-checked={pickup} className={pickup ? 'on' : ''} onClick={() => pickMethod('pickup')}><Store size={20} aria-hidden="true" /><b>Do‘kondan olib ketish</b><small>Yetkazish haqi yo‘q</small></button>
          </div>
          {pickup && <p className="pickup-note"><MapPin size={16} aria-hidden="true" /><span><b>{shop?.name}</b><br />{shop?.address}</span></p>}
        </fieldset>

        <fieldset className="co-section"><legend>{pickup ? 'Olib ketuvchi' : 'Kimdan va kimga'}</legend>
          <div className="form-grid stack-on-phone"><TextField name="name" label="Ismingiz" value={customer.name} onChange={v => update('name', v)} onBlur={() => check('name')} error={fields.name} placeholder="Dilnoza Karimova…" autoComplete="name" autoCapitalize="words" maxLength={80} enterKeyHint="next" /><PhoneField name="phone" label="Telefoningiz" value={customer.phone} onChange={v => update('phone', v)} onBlur={() => check('phone')} error={fields.phone} /></div>
          {!pickup && <>
            <label className="checkbox self-toggle"><input type="checkbox" checked={self} onChange={e => { setSelf(e.target.checked); setFields({}); }} />Gullar o‘zim uchun</label>
            {!self && <>
              {recent.length > 0 && <div className="recent-places" role="group" aria-label="Oldingi manzillar"><span><History size={14} aria-hidden="true" /> Oldingi manzillar</span>{recent.map(p => <button type="button" key={p.address} className={customer.address === p.address ? 'on' : ''} onClick={() => usePlace(p)}><b>{p.recipient}</b><small>{p.address}</small></button>)}</div>}
              <div className="form-grid stack-on-phone"><TextField name="recipient" label="Qabul qiluvchi" value={customer.recipient} onChange={v => update('recipient', v)} onBlur={() => check('recipient')} error={fields.recipient} placeholder="Kim uchun? Masalan: Madina opa…" autoCapitalize="words" maxLength={80} enterKeyHint="next" /><PhoneField name="recipientPhone" label="Qabul qiluvchi telefoni" value={customer.recipientPhone} onChange={v => update('recipientPhone', v)} onBlur={() => check('recipientPhone')} error={fields.recipientPhone} /></div>
            </>}
            <TextField name="address" label="Urganchdagi yetkazish manzili" value={customer.address} onChange={v => update('address', v)} onBlur={() => check('address')} error={fields.address} placeholder="Ko‘cha, uy, xonadon va mo‘ljal. Masalan: Al-Xorazmiy 12, 3-xonadon, Anor do‘koni yonida…" autoComplete="street-address" multiline rows={2} maxLength={300} />
            <div className="map-field">
              {point ? <p className="map-set"><MapPin size={16} aria-hidden="true" /> Xaritada belgilandi<button type="button" className="map-clear" onClick={() => setPoint(null)} aria-label="Xarita nuqtasini olib tashlash"><X size={14} /></button></p> : null}
              <button type="button" className="secondary" onClick={() => setMapOpen(true)}><MapPin size={17} /> {point ? 'Nuqtani o‘zgartirish' : 'Xaritada belgilash'}</button>
              <p className="field-help">Aniq nuqta kuryerga yo‘l topishga yordam beradi (ixtiyoriy).</p>
            </div>
          </>}
        </fieldset>

        <fieldset className="co-section"><legend>{pickup ? 'Qachon olib ketasiz?' : 'Qachon yetkazilsin?'}</legend>
          {shop && status.hasHours && <p className={`closed-note${status.open ? ' ok' : ''}`} role="status">{status.open ? `${shop.name} hozir ochiq, ${status.closesAt} gacha.` : `${shop.name} hozir yopiq (ish vaqti ${status.label}). Do‘kon ochilgach javob beradi; vaqtni tanlang.`}</p>}
          <div className="day-chips" role="radiogroup" aria-label="Sana">{days.map(d => <button type="button" key={d} role="radio" aria-checked={date === d} className={date === d ? 'on' : ''} onClick={() => { haptic(); setDate(d); if (choice?.when === 'slot' && choice.date !== d) setChoice(null); }}><b>{dayLabel(d, now)}</b></button>)}</div>
          <div className="time-chips" role="radiogroup" aria-label="Vaqt oralig‘i">
            {date === today && <button type="button" role="radio" aria-checked={choice?.when === 'asap'} disabled={!asapOk} className={choice?.when === 'asap' ? 'on' : ''} onClick={() => { haptic(); setChoice({ when: 'asap' }); }}><b>Imkon qadar tezroq</b><small>{asapOk ? 'Do‘kon vaqtni tasdiqlaydi' : 'Do‘kon yopiq'}</small></button>}
            {windows.map(w => { const on = choice?.when === 'slot' && choice.date === date && choice.from === w.from; return <button type="button" key={w.from} role="radio" aria-checked={on} disabled={!w.ok} title={w.reason} className={on ? 'on' : ''} onClick={() => { haptic(); setChoice({ when: 'slot', date, from: w.from, to: w.to }); }}><b>{w.from}–{w.to}</b></button>; })}
          </div>
          {date !== today && !windows.some(w => w.ok) && <p className="field-help">Bu kunga bo‘sh vaqt yo‘q. Boshqa sanani tanlang.</p>}
          {choice ? <p className="chosen-time"><Clock3 size={16} aria-hidden="true" /> {chosenText}</p> : <p className="field-help">Sana va vaqt oralig‘ini tanlang.</p>}
        </fieldset>

        {canCard && <fieldset className="co-section"><legend>To‘lov</legend>
          <div className="method-toggle" role="radiogroup" aria-label="To‘lov usuli">
            <button type="button" role="radio" aria-checked={pay === 'cash'} disabled={mustCard} className={pay === 'cash' ? 'on' : ''} onClick={() => { haptic(); setPayPref('cash'); }}><Banknote size={20} aria-hidden="true" /><b>Naqd</b><small>{pickup ? 'Olib ketganda' : 'Yetkazilganda'}</small></button>
            <button type="button" role="radio" aria-checked={pay === 'card'} className={pay === 'card' ? 'on' : ''} onClick={() => { haptic(); setPayPref('card'); }}><CreditCard size={20} aria-hidden="true" /><b>Kartaga o‘tkazma</b><small>Do‘kon qabul qilgach</small></button>
          </div>
          {pay === 'card'
            ? <p className="pay-explain">Do‘kon buyurtmani qabul qilgach karta raqami ko‘rinadi. Gullar uchun <b>{money(subtotal)}</b> kartaga o‘tkaziladi{fee > 0 ? <>, yo‘l haqi <b>{money(fee)}</b> esa yetkazgan taksi haydovchisiga naqd beriladi.</> : '.'}</p>
            : <p className="pay-explain">Hammasini {pickup ? 'olib ketganda' : 'yetkazilganda'} naqd berasiz.</p>}
          {mustCard && <p className="field-help">Bu do‘kon taksi bilan yetkazadi, shuning uchun gullar pulini oldindan kartaga o‘tkazasiz.</p>}
        </fieldset>}
        <fieldset className="co-section"><legend>Tabrik kartasi <span className="optional">(ixtiyoriy)</span></legend>
          <div className="card-styles" role="radiogroup" aria-label="Karta uslubi">{styles.map(s => <button type="button" key={s} role="radio" aria-checked={customer.cardStyle === s} aria-label={`${cardName(s)} kartasi`} className={customer.cardStyle === s ? 'on' : ''} onClick={() => { haptic(); update('cardStyle', s); }}><GreetingCard style={s} small /></button>)}</div>
          <div className="template-chips" aria-label="Tayyor tilaklar">{cardTemplates.map(t => <button type="button" key={t} onClick={() => update('note', t)}>{t}</button>)}</div>
          <label className="field">Tabrik matni<textarea value={customer.note} onChange={e => update('note', e.target.value)} maxLength={300} placeholder="Gullar bilan birga samimiy tilaklaringiz…" rows={3} /></label>
          {customer.note.trim() && <>
            {!customer.anonymous && <label className="field">Kimdan<input value={customer.cardFrom} onChange={e => update('cardFrom', e.target.value)} placeholder={customer.name || 'Ismingiz'} maxLength={40} /></label>}
            <GreetingCard style={customer.cardStyle || 'classic'} text={customer.note} from={customer.anonymous ? '' : customer.cardFrom || customer.name} />
          </>}
          <label className="checkbox"><input type="checkbox" checked={customer.anonymous} onChange={e => update('anonymous', e.target.checked)} />Yuboruvchining ismini qabul qiluvchiga aytmang</label>
        </fieldset>
      </form>}
      </motion.div>
      <div className="order-summary"><div><span>Gullar</span><span>{money(subtotal)}</span></div><div><span><Truck size={15} /> {pickup ? 'Olib ketish' : 'Yetkazib berish'}</span><span>{pickup ? '0 so‘m' : money(fee)}</span></div><div className="total"><strong>Jami</strong><strong>{money(total)}</strong></div>{pay === 'card' && <><div className="split"><span><CreditCard size={15} /> Kartaga (gullar)</span><span>{money(subtotal)}</span></div>{fee > 0 && <div className="split"><span><Banknote size={15} /> Taksiga naqd (yo‘l haqi)</span><span>{money(fee)}</span></div>}</>}</div>
      <div className="payment-note"><ShieldCheck size={19} /><div><strong>{pay === 'card' ? 'To‘lov — gullar kartaga, yo‘l haqi naqd' : `To‘lov — ${pickup ? 'olib ketganda' : 'yetkazilganda'}`}</strong><p>Do‘kon buyurtmani va vaqtni tasdiqlaydi.</p></div></div>
      {step === 0 ? <button className="primary full" onClick={() => setStep(1)}>Buyurtma berish <ArrowRight size={19} /></button> : <><button className="primary full" type="submit" form="checkout" disabled={busy}>{busy ? 'Saqlanmoqda…' : catalog.demo ? 'Demo buyurtmani saqlash' : 'Buyurtmani yuborish'} <CheckCircle2 size={19} /></button><button className="text-button full" disabled={busy} onClick={() => setStep(0)}>Savatga qaytish</button></>}
    </>}
    {mapOpen && <Suspense fallback={<Dialog title="Xarita yuklanmoqda" onClose={() => setMapOpen(false)}><p className="field-help">Bir soniya…</p></Dialog>}><MapPicker initial={point} onClose={() => setMapOpen(false)} onPick={p => { setPoint(p); setMapOpen(false); }} /></Suspense>}
  </Dialog>;
}
