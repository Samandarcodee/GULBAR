import { GreetingCard, cardName } from './GreetingCard';
import { deliveryLabel } from '../../server/delivery.js';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, Check, Circle, Minus, PackageCheck, Store, Plus, LogOut, RefreshCw, ShoppingBag, Wallet, Flower2 } from 'lucide-react';
import type { Catalog, Order, Product, MerchantWorkspace, AccountAuth } from '../types';
import { api, ApiError, money, statusNames } from '../lib/api';
import { Dialog } from './Dialog';
import { AccountLogin } from './AccountLogin';
import { preparePhoto } from '../lib/photo';
const nextStatuses: Record<string, string[]> = { pending: ['accepted', 'cancelled'], accepted: ['delivering', 'cancelled'], delivering: ['delivered'], delivered: [], cancelled: [] };
const audienceOptions = [['ona', 'Onaga'], ['rafiqa', 'Rafiqaga'], ['qiz', 'Qizga'], ['dost', 'Do‘stga'], ['hamkasb', 'Hamkasbga']] as const;
const times = { soon: 'Eng yaqin vaqt', 'today-evening': 'Bugun 18:00–21:00', tomorrow: 'Ertaga 10:00–18:00' };

export function Merchant({ catalog, back, reload }: { catalog: Catalog; back: () => void; reload: () => void }) {
  const [shopId, setShopId] = useState(new URLSearchParams(location.search).get('shop') || catalog.shops[0]?.id || '');
  const [token, setToken] = useState('');
  const [loginMode, setLoginMode] = useState(!catalog.demo || catalog.merchantProtected ? 'account' : 'key');
  const [accountSession, setAccountSession] = useState(false);
  const [workspace, setWorkspace] = useState<MerchantWorkspace | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [edit, setEdit] = useState<Partial<Product> | null>(null);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [preview, setPreview] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);
  const [extra, setExtra] = useState<string[]>([]);
  const [extraBusy, setExtraBusy] = useState(false);
  const photoJob = useRef(0);
  useEffect(() => { if (!photo) { setPreview(''); return; } const url = URL.createObjectURL(photo); setPreview(url); return () => URL.revokeObjectURL(url); }, [photo]);
  useEffect(() => () => { photoJob.current++; }, []);
  function openEdit(product: Partial<Product> | null) { photoJob.current++; setPhotoBusy(false); setPhoto(null); setImageUrl(product?.image || ''); setExtra(product?.images || []); setError(''); setEdit(product); }
  async function addExtra(files: FileList | null) {
    if (!files?.length) return;
    setExtraBusy(true); setError('');
    try {
      const urls: string[] = [];
      for (const file of [...files].slice(0, Math.max(0, 4 - extra.length))) {
        const ready = await preparePhoto(file);
        const uploaded = await api<{ url: string }>(`/merchant/${shopId}/images`, { method: 'POST', headers: { 'Content-Type': ready.type }, body: ready }, token);
        urls.push(uploaded.url);
      }
      setExtra(list => [...list, ...urls].slice(0, 4));
    } catch (e) { setError((e as Error).message); } finally { setExtraBusy(false); }
  }
  async function selectPhoto(file?: File) {
    if (!file) return;
    const job = ++photoJob.current; setPhotoBusy(true); setError('');
    try { const ready = await preparePhoto(file); if (job === photoJob.current) { setPhoto(ready); setImageUrl(''); } }
    catch (e) { if (job === photoJob.current) setError((e as Error).message); }
    finally { if (job === photoJob.current) setPhotoBusy(false); }
  }
  const [cancel, setCancel] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);
  const [section, setSection] = useState('orders');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const session = useRef(0);
  useEffect(() => () => { session.current++; }, []);
  async function load(id = shopId, key = token) {
    const currentSession = session.current;
    try {
      const [data, latest] = await Promise.all([api<MerchantWorkspace>(`/merchant/${id}/workspace`, {}, key), api<Order[]>(`/merchant/${id}/orders`, {}, key)]);
      if (currentSession !== session.current) return;
      setWorkspace(data); setOrders(latest); setError('');
    } catch (e) {
      if (currentSession !== session.current) return;
      if (e instanceof ApiError && e.status === 401) { setWorkspace(null); setOrders([]); setToken(''); }
      setError((e as Error).message);
    }
  }
  const authenticated = !!workspace;
  useEffect(() => { if (!authenticated) return; const timer = setInterval(() => load(), 15000); return () => clearInterval(timer); }, [authenticated, shopId, token]);
  function accountLogin(auth: AccountAuth) { if (!auth.user.shopId) return; setShopId(auth.user.shopId); setToken(auth.token); setAccountSession(true); load(auth.user.shopId, auth.token); }
  async function login(e: FormEvent) { e.preventDefault(); setBusy(true); await load(); setBusy(false); }
  function logout() { if (accountSession) void api('/auth/logout', { method: 'POST' }, token).catch(() => {}); session.current++; setWorkspace(null); setOrders([]); setToken(''); setEdit(null); setError(''); setNotice(''); setSection('orders'); setSearch(''); setFilter('all'); setAccountSession(false); }
  async function changeStatus(id: string, status: string) {
    setBusy(true); setNotice('');
    try { await api(`/merchant/${shopId}/orders/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }, token); setCancel(null); await load(); reload(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function quick(p: Product, patch: Partial<Product>) {
    if (busy) return; setBusy(true); setError(''); setNotice('');
    try { await api(`/merchant/${shopId}/products/${p.id}`, { method: 'PATCH', body: JSON.stringify({ ...patch, expectedStock: p.stock }) }, token); await load(); reload(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError(''); setNotice('');
    const data = new FormData(e.currentTarget);
    try {
      let image = imageUrl;
      if (photo) { const uploaded = await api<{ url: string }>(`/merchant/${shopId}/images`, { method: 'POST', headers: { 'Content-Type': photo.type }, body: photo }, token); image = uploaded.url; setImageUrl(image); setPhoto(null); }
      const product = { name: data.get('name'), description: data.get('description'), price: Number(data.get('price')), stock: Number(data.get('stock')), category: data.get('category'), audience: data.getAll('audience'), images: extra, image, badge: data.get('badge'), active: data.get('active') === 'on', ...(edit?.id ? { expectedStock: edit.stock } : {}) };
      await api(`/merchant/${shopId}/products${edit?.id ? `/${edit.id}` : ''}`, { method: edit?.id ? 'PATCH' : 'POST', body: JSON.stringify(product) }, token); openEdit(null); await load(); reload(); setNotice('Gul ma’lumotlari saqlandi.'); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function saveSettings(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError(''); setNotice('');
    const data = new FormData(e.currentTarget);
    const settings = { name: data.get('name'), subtitle: data.get('subtitle'), address: data.get('address'), deliveryFee: Number(data.get('deliveryFee')), deliveryTime: data.get('deliveryTime'), active: data.get('active') === 'on', hours: data.get('always') === 'on' ? null : { open: data.get('hoursOpen'), close: data.get('hoursClose') } };
    try { await api(`/merchant/${shopId}/settings`, { method: 'PATCH', body: JSON.stringify(settings) }, token); await load(); reload(); setNotice('Do‘kon sozlamalari saqlandi.'); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const visibleOrders = orders.filter(o => (filter === 'all' || o.status === filter) && `${o.id} ${o.customer.name} ${o.customer.recipient} ${o.customer.phone} ${o.customer.recipientPhone}`.toLowerCase().includes(search.toLowerCase().trim()));
  const pending = orders.filter(o => o.status === 'pending').length;
  const inProgress = orders.filter(o => o.status === 'accepted' || o.status === 'delivering').length;
  const revenue = orders.filter(o => o.status === 'delivered').reduce((sum, o) => sum + o.total, 0);
  const products = workspace?.products || [];
  return <main className="merchant page-content">
    <button className="text-button" onClick={back}><ArrowLeft size={18} /> Katalogga qaytish</button>
    <div className="page-heading"><div><p className="eyebrow">GulBar hamkorlar</p><h1>Do‘kon paneli</h1>{workspace && <p>{workspace.shop.name} · {workspace.shop.active ? 'Buyurtma qabul qilmoqda' : 'Vaqtincha yopiq'}</p>}</div><Store size={32} /></div>
    {catalog.demo && <p className="demo-note">Demo panel. {catalog.merchantProtected ? 'Internetdagi panel kirish kaliti bilan himoyalangan.' : 'Haqiqiy rejimda har bir do‘kon alohida kirish kaliti bilan himoyalanadi.'} Demo buyurtmalar yetkazilmaydi.</p>}
    {!workspace && loginMode === 'account' && <AccountLogin role="merchant" onLogin={accountLogin} />}
    {!workspace && <button className="text-button" onClick={() => { setLoginMode(loginMode === 'account' ? 'key' : 'account'); setError(''); }}>{loginMode === 'account' ? 'Kalit bilan kirish' : 'Login va parol bilan kirish'}</button>}
    {!workspace && loginMode === 'key' && <form className="merchant-login" onSubmit={login}><div className="merchant-welcome"><Store size={28} /><h2>Do‘koningizni boshqaring</h2><p>Buyurtmalar, gullar va yetkazish — bitta panelda.</p></div>
      <label className="field">Do‘kon ID<input value={shopId} list="merchant-shops" onChange={e => setShopId(e.target.value.trim())} required pattern="[a-z0-9-]{2,40}" autoComplete="off" placeholder="Masalan: lola" /></label><datalist id="merchant-shops">{catalog.shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</datalist>
      <p className="field-help">Do‘kon ID va kirish kalitini GulBar administratoridan oling. Yopiq do‘kon ham ID orqali kira oladi.</p>
      {(!catalog.demo || catalog.merchantProtected) && <label className="field">Do‘kon kirish kaliti<input type="password" value={token} onChange={e => setToken(e.target.value)} required autoComplete="current-password" /></label>}<button className="primary" disabled={!shopId || busy}>{busy ? 'Tekshirilmoqda…' : 'Panelni ochish'}</button></form>}
    {error && <p className="error-banner" role="alert">{error}</p>}{notice && <p className="merchant-notice" role="status">{notice}</p>}
    {workspace && <>
      <div className="merchant-toolbar"><span>Har 15 soniyada yangilanadi</span><div><button className="secondary" onClick={() => load()} disabled={busy}><RefreshCw size={16} /> Yangilash</button><button className="text-button" onClick={logout} disabled={busy}><LogOut size={16} /> Chiqish</button></div></div>
      {(!workspace.shop.active || !products.length) && <div className="mc-start"><h2>Do‘koningizni ishga tushiring</h2><ol>
        <li className={products.length ? 'ok' : ''}><span className="mc-dot">{products.length ? <Check size={14} strokeWidth={2.6} /> : <Circle size={11} />}</span><div><strong>Gul qo‘shing</strong><p>Rasm, nom va narxni kiriting. Telefondan rasm olish mumkin.</p></div>{!products.length && section !== 'products' && <button className="primary" onClick={() => { setSection('products'); openEdit({}); }}>Gul qo‘shish</button>}</li>
        <li className={workspace.shop.active ? 'ok' : ''}><span className="mc-dot">{workspace.shop.active ? <Check size={14} strokeWidth={2.6} /> : <Circle size={11} />}</span><div><strong>Do‘konni oching</strong><p>Ochiq do‘kon xaridorlarga ko‘rinadi va buyurtma oladi.</p></div>{!workspace.shop.active && <button className="secondary" onClick={() => setSection('settings')}>Sozlamalar</button>}</li>
      </ol></div>}
      <div className="merchant-stats"><article><ShoppingBag size={20} /><span>Yangi buyurtmalar</span><strong>{pending}</strong></article><article><PackageCheck size={20} /><span>Jarayonda</span><strong>{inProgress}</strong></article><article><Wallet size={20} /><span>Yetkazilgan savdo</span><strong>{money(revenue)}</strong></article><article><Flower2 size={20} /><span>Katalogdagi gullar</span><strong>{products.filter(p => p.active !== false).length}<small> / {products.length}</small></strong></article></div>
      <p className="field-help">Ko‘rsatkichlar oxirgi 100 buyurtma bo‘yicha. Savdo summasi yetkazish haqini ham o‘z ichiga oladi.</p>
      <div className="tabs" role="group" aria-label="Panel bo‘limlari"><button aria-pressed={section === 'orders'} className={section === 'orders' ? 'active' : ''} onClick={() => { setSection('orders'); setNotice(''); }}>Buyurtmalar ({orders.length})</button><button aria-pressed={section === 'products'} className={section === 'products' ? 'active' : ''} onClick={() => { setSection('products'); setNotice(''); }}>Gullar va narxlar</button><button aria-pressed={section === 'settings'} className={section === 'settings' ? 'active' : ''} onClick={() => { setSection('settings'); setNotice(''); }}>Do‘kon sozlamalari</button></div>
      {section === 'orders' && <><div className="merchant-filters"><label className="field">Buyurtma holati<select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">Barcha buyurtmalar</option>{Object.entries(statusNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="field">Buyurtma qidirish<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Raqam, ism yoki telefon" /></label></div>
        {visibleOrders.length ? <div className="merchant-orders">{visibleOrders.map(o => <article className="order-card" key={o.id}><header><strong>#{o.id.slice(0, 8)}</strong><span className={`status ${o.status}`}>{statusNames[o.status]}</span></header><p>{new Date(o.createdAt).toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' })}</p>{o.items.map(i => <div className="order-line" key={i.productId}><span>{i.name} × {i.quantity}</span><strong>{money(i.price * i.quantity)}</strong></div>)}<div className="merchant-customer"><strong>{o.customer.recipient}</strong><a href={`tel:${o.customer.recipientPhone}`}>{o.customer.recipientPhone}</a>{o.delivery?.method === 'pickup' ? <p className="merchant-pickup"><b>Do‘kondan olib ketadi</b> — yetkazish kerak emas</p> : <p>{o.customer.address}{o.delivery?.point && <> · <a href={`https://www.openstreetmap.org/?mlat=${o.delivery.point.lat}&mlon=${o.delivery.point.lng}#map=18/${o.delivery.point.lat}/${o.delivery.point.lng}`} target="_blank" rel="noreferrer">Xaritada ko‘rish</a></>}</p>}<p>Buyurtmachi: {o.customer.name} · <a href={`tel:${o.customer.phone}`}>{o.customer.phone}</a></p><p>Vaqt: <b>{deliveryLabel(o) || times[o.customer.deliveryTime]}</b></p>{o.afterHours && <p className="merchant-pickup">Do‘kon yopiq paytda kelgan buyurtma.</p>}{o.customer.note && <div className="merchant-card"><small>Tabrik kartasi · {cardName(o.customer.cardStyle || 'classic')}</small><GreetingCard style={o.customer.cardStyle || 'classic'} text={o.customer.note} from={o.customer.anonymous ? '' : o.customer.cardFrom} /></div>}{o.customer.anonymous && <p>Anonim sovg‘a — yuboruvchini aytmang.</p>}</div><div className="order-line"><span>Yetkazish haqi</span><strong>{money(o.deliveryFee)}</strong></div><div className="order-line"><span>Yetkazish bilan jami</span><strong>{money(o.total)}</strong></div><p>To‘lov: yetkazilganda</p>{!o.demo && <p>Xabar: {o.notification === 'sent' ? 'Telegramga yuborilgan' : 'Telegramga yuborish navbatida'}</p>}<div className="order-actions">{nextStatuses[o.status]?.map(s => <button className={s === 'cancelled' ? 'secondary' : 'primary'} key={s} disabled={busy} onClick={() => s === 'cancelled' ? setCancel(o) : changeStatus(o.id, s)}>{statusNames[s]}</button>)}</div></article>)}</div> : <div className="empty"><PackageCheck size={38} /><h3>{orders.length ? 'Mos buyurtma topilmadi' : 'Hozircha buyurtma yo‘q'}</h3><p>{orders.length ? 'Qidiruv yoki holat filtrini o‘zgartiring.' : 'Yangi buyurtmalar shu yerda ko‘rinadi.'}</p></div>}</>}
      {section === 'products' && <><div className="merchant-section-heading"><div><h2>Gullar va narxlar</h2><p>Qoldiq tugagan gulga buyurtma berib bo‘lmaydi.</p></div><button className="primary" onClick={() => openEdit({})}><Plus size={18} /> Gul qo‘shish</button></div><div className="merchant-products">{products.map(p => <article key={p.id} className={p.active === false ? 'is-hidden' : ''}><img src={p.image} alt={p.name} loading="lazy" /><div className="mp-main"><strong>{p.name}</strong><p>{money(p.price)}</p><span className="inventory-tag">{p.active === false ? 'Katalogdan yashirilgan' : p.stock === 0 ? 'Tugagan' : 'Sotuvda'}</span><div className="mp-stock" role="group" aria-label={`${p.name} qoldig‘i`}><button disabled={busy || p.stock <= 0} aria-label="Qoldiqni kamaytirish" onClick={() => quick(p, { stock: p.stock - 1 })}><Minus size={15} /></button><span>{p.stock} dona</span><button disabled={busy || p.stock >= 10000} aria-label="Qoldiqni ko‘paytirish" onClick={() => quick(p, { stock: p.stock + 1 })}><Plus size={15} /></button></div></div><div className="mp-side"><label className="mp-switch"><input type="checkbox" role="switch" checked={p.active !== false} disabled={busy} onChange={e => quick(p, { active: e.target.checked })} aria-label={`${p.name}: katalogda ko‘rsatish`} /><span className="mp-track" aria-hidden="true" /><span className="mp-switch-text">{p.active === false ? 'Yashirin' : 'Ko‘rinadi'}</span></label><button className="secondary" onClick={() => openEdit(p)}>Tahrirlash</button></div></article>)}</div>{!products.length && <div className="empty"><Flower2 size={38} /><h3>Birinchi gulingizni qo‘shing</h3></div>}</>}
      {section === 'settings' && <form className="merchant-settings product-form" key={workspace.shop.id + workspace.shop.name + workspace.shop.active + JSON.stringify(workspace.shop.hours || null)} onSubmit={saveSettings}><h2>Do‘kon va yetkazish</h2><label className="field">Do‘kon nomi<input name="name" defaultValue={workspace.shop.name} maxLength={100} required /></label><label className="field">Qisqa tavsif<input name="subtitle" defaultValue={workspace.shop.subtitle} maxLength={150} required /></label><label className="field">Do‘kon manzili<input name="address" defaultValue={workspace.shop.address} maxLength={250} required /></label><div className="form-grid"><label className="field">Yetkazish haqi (so‘m)<input name="deliveryFee" type="number" min={0} max={200000} defaultValue={workspace.shop.deliveryFee} required /></label><label className="field">Yetkazish muddati<input name="deliveryTime" maxLength={60} defaultValue={workspace.shop.deliveryTime} placeholder="30–60 daqiqa" required /></label></div><fieldset className="hours-field"><legend>Ish vaqti (Toshkent vaqti)</legend><label className="merchant-checkbox"><input name="always" type="checkbox" defaultChecked={!workspace.shop.hours} /> Doim ochiq (ish vaqti belgilanmagan)</label><div className="form-grid"><label className="field">Ochiladi<input type="time" name="hoursOpen" defaultValue={workspace.shop.hours?.open || '09:00'} /></label><label className="field">Yopiladi<input type="time" name="hoursClose" defaultValue={workspace.shop.hours?.close || '21:00'} /></label></div><p className="field-help">Yopiq vaqtda xaridor faqat ertangi yetkazish uchun buyurtma bera oladi. Yarim tundan keyingi vaqtni ham yozish mumkin, masalan 09:00 – 01:00.</p></fieldset>
      <label className="merchant-checkbox"><input name="active" type="checkbox" defaultChecked={workspace.shop.active} /> Do‘kon ochiq, buyurtma qabul qilaman</label><p className="field-help">Yopiq do‘kon katalogdan yashiriladi. Avvalgi buyurtmalar panelda qoladi. Yangi yetkazish haqi faqat yangi buyurtmalarga qo‘llanadi.</p><button className="primary" disabled={busy}>{busy ? 'Saqlanmoqda…' : 'Sozlamalarni saqlash'}</button></form>}
    </>}
    {cancel && <Dialog title="Buyurtmani bekor qilish" onClose={() => { if (!busy) setCancel(null); }}><p>#{cancel.id.slice(0, 8)} buyurtma bekor qilinadi va gullar qoldiqqa qaytariladi. Mijozga telefon qilib sababini tushuntiring.</p><div className="order-actions"><button className="secondary" disabled={busy} onClick={() => setCancel(null)}>Ortga</button><button className="primary" disabled={busy} onClick={() => changeStatus(cancel.id, 'cancelled')}>Bekor qilishni tasdiqlash</button></div>{error && <p role="alert" className="error-banner">{error}</p>}</Dialog>}
    {edit && <Dialog title={edit.id ? 'Gulni tahrirlash' : 'Yangi gul'} onClose={() => { if (!busy && !photoBusy) openEdit(null); }}><form className="product-form" onSubmit={save}>{error && <p className="error-banner" role="alert">{error}</p>}
      <label className="field">Nomi<input name="name" defaultValue={edit.name} maxLength={100} required /></label><label className="field">Tavsifi<textarea name="description" defaultValue={edit.description} maxLength={1000} required /></label>
      <div className="form-grid"><label className="field">Narxi (so‘m)<input name="price" type="number" min={1000} max={10000000} defaultValue={edit.price || 100000} required /></label><label className="field">Mavjud soni<input name="stock" type="number" min={0} max={10000} defaultValue={edit.stock ?? 10} required /></label></div>
      <label className="field">Kategoriya<select name="category" defaultValue={edit.category || 'bouquet'}><option value="bouquet">Guldastalar</option><option value="rose">Atirgullar</option><option value="tulip">Lolalar</option><option value="box">Gul qutilari</option></select></label>
      <fieldset className="audience-field" key={edit.id || 'new'}><legend>Kimga mos?</legend><div>{audienceOptions.map(([value, label]) => <label key={value} className="merchant-checkbox"><input type="checkbox" name="audience" value={value} defaultChecked={edit.audience?.includes(value)} /> {label}</label>)}</div><p className="field-help">Xaridor bosh sahifada «Kimga gul olasiz?» deb tanlaydi. Hech narsa belgilanmasa, gul hamma uchun ko‘rinadi.</p></fieldset>
      <div className="photo-picker">
        <label className="field photo-select">Telefondan rasm tanlash<input className="photo-file" type="file" accept="image/*" aria-label="Telefondan rasm tanlash" disabled={busy || photoBusy} onChange={e => { void selectPhoto(e.target.files?.[0]); e.target.value = ''; }} /><span className="photo-choose"><Plus size={18} /> {photoBusy ? 'Tayyorlanmoqda…' : preview || imageUrl ? 'Rasmni almashtirish' : 'Galereyadan tanlash'}</span></label>
        <p className="field-help">Galereyadan tanlang. Rasm avtomatik kichrayadi va Saqlash bosilganda yuklanadi.</p>
        {photoBusy && <p role="status">Rasm tayyorlanmoqda…</p>}
        {(preview || imageUrl) && <img className="photo-preview" src={preview || imageUrl} alt="Tanlangan gul rasmi" />}
      </div>
      <div className="extra-photos"><span className="extra-title">Qo‘shimcha rasmlar <small>(ixtiyoriy, {extra.length}/4)</small></span><div className="extra-row">{extra.map((u, i) => <div className="extra-thumb" key={u}><img src={u} alt={`Qo‘shimcha rasm ${i + 1}`} /><button type="button" aria-label={`${i + 1}-rasmni olib tashlash`} onClick={() => setExtra(list => list.filter(x => x !== u))}>×</button></div>)}{extra.length < 4 && <label className="extra-add"><input type="file" accept="image/*" multiple disabled={busy || photoBusy || extraBusy} aria-label="Qo‘shimcha rasmlar tanlash" onChange={e => { void addExtra(e.target.files); e.target.value = ''; }} /><Plus size={20} /><span>{extraBusy ? 'Yuklanmoqda…' : 'Qo‘shish'}</span></label>}</div></div>
      <label className="field">Rasm manzili (HTTPS yoki mavjud rasm)<input name="image" value={imageUrl} onChange={e => { setImageUrl(e.target.value); setPhoto(null); }} placeholder="Yoki https://… havola kiriting" required={!photo} disabled={busy || photoBusy} /></label><label className="field">Yorliq<input name="badge" defaultValue={edit.badge || 'Guldasta'} maxLength={30} /></label><label className="merchant-checkbox"><input type="checkbox" name="active" defaultChecked={edit.active !== false} /> Katalogda ko‘rsatish</label><button className="primary full" disabled={busy || photoBusy}>{busy ? 'Saqlanmoqda…' : 'Saqlash'}</button><button type="button" className="text-button full" disabled={busy || photoBusy} onClick={() => openEdit(null)}>Bekor qilish</button>
    </form></Dialog>}
  </main>;
}
