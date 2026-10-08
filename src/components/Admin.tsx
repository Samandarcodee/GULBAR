import { useEffect, useRef, useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Check, Circle, Copy, Eye, EyeOff, LogOut, Plus, RefreshCw, Search, Sparkles, Store } from 'lucide-react';
import type { AccountAuth, AdminShop } from '../types';
import { api, ApiError, money } from '../lib/api';
import { Dialog } from './Dialog';
import { AccountLogin } from './AccountLogin';
import { SupportInbox } from './SupportInbox';

const palette = ['#efe3c8', '#ecdcae', '#e9ddd0', '#f3dce2', '#e2e9dd', '#dfe8ee', '#ebe0f0'];
const ease = [0.22, 1, 0.36, 1] as const;
const slug = (s: string) => s.toLowerCase().replace(/[ʻʼ’‘'`´]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
const initialsOf = (name: string) => (name.trim().split(/\s+/).map(w => w[0] || '').join('').slice(0, 2) || 'GB').toUpperCase();
const colorOf = (name: string) => palette[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % palette.length];
function makePassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return [...crypto.getRandomValues(new Uint8Array(14))].map(n => alphabet[n % alphabet.length]).join('');
}
function steps(s: AdminShop) {
  return [
    { ok: !!s.phone, label: 'Telefon', todo: 'Telefon raqamini kiriting' },
    { ok: !!s.telegramChatId, label: 'Telegram', todo: 'Egasining Telegram ID’sini kiriting' },
    { ok: !!s.login && s.accountEnabled, label: 'Login', todo: s.login ? 'Login hisobi bloklangan' : 'Login yarating' },
    { ok: (s.products || 0) > 0, label: `${s.products || 0} ta gul`, todo: 'Gul qo‘shilishi kerak (egasi paneldan qo‘shadi)' },
  ];
}

function ShopForm({ edit, busy, error, onSubmit, onClose }: { edit: Partial<AdminShop>; busy: boolean; error: string; onSubmit: (data: FormData) => void; onClose: () => void }) {
  const isNew = !edit.id;
  const needsLogin = isNew || !edit.login;
  const [name, setName] = useState(edit.name || '');
  const [login, setLogin] = useState('');
  const [touched, setTouched] = useState(false);
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [phone, setPhone] = useState(edit.phone || '+998');
  useEffect(() => { if (needsLogin && !touched) setLogin(slug(name).replace(/-/g, '.')); }, [name, touched, needsLogin]);
  const submit = (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); onSubmit(new FormData(e.currentTarget)); };
  return <form className="product-form shop-form" onSubmit={submit}>
    <fieldset className="form-section"><legend>Do‘kon</legend>
      <label className="field" htmlFor="sf-name">Do‘kon nomi</label>
      <input id="sf-name" name="name" value={name} onChange={e => setName(e.target.value)} maxLength={100} placeholder="Masalan: Madina Gullari" required />
      <label className="field" htmlFor="sf-sub">Qisqa tavsif</label>
      <input id="sf-sub" name="subtitle" defaultValue={edit.subtitle} maxLength={150} placeholder="Gullar va sovg‘alar · 9:00–01:00" required />
      <label className="field" htmlFor="sf-addr">Manzil</label>
      <input id="sf-addr" name="address" defaultValue={edit.address} maxLength={250} placeholder="Ko‘cha, mo‘ljal" required />
      <label className="field" htmlFor="sf-phone">Do‘kon telefoni</label>
      <input id="sf-phone" name="phone" type="tel" inputMode="tel" value={phone} onChange={e => setPhone('+' + e.target.value.replace(/\D/g, '').slice(0, 12))} pattern="\+998[0-9]{9}" placeholder="+998901234567" required />
    </fieldset>
    <fieldset className="form-section"><legend>Yetkazish</legend>
      <div className="form-grid">
        <div><label className="field" htmlFor="sf-fee">Yetkazish haqi (so‘m)</label><input id="sf-fee" name="deliveryFee" type="number" inputMode="numeric" min={0} max={200000} step={1000} defaultValue={edit.deliveryFee ?? 20000} required /></div>
        <div><label className="field" htmlFor="sf-time">Yetkazish muddati</label><input id="sf-time" name="deliveryTime" defaultValue={edit.deliveryTime || '60–90 daqiqa'} maxLength={60} required /></div>
      </div>
      <label className="merchant-checkbox"><input name="always" type="checkbox" defaultChecked={!edit.hours} /> Doim ochiq (ish vaqti belgilanmagan)</label>
      <div className="form-grid">
        <div><label className="field" htmlFor="sf-open">Ochiladi (Toshkent vaqti)</label><input id="sf-open" type="time" name="hoursOpen" defaultValue={edit.hours?.open || '09:00'} /></div>
        <div><label className="field" htmlFor="sf-close">Yopiladi</label><input id="sf-close" type="time" name="hoursClose" defaultValue={edit.hours?.close || '21:00'} /></div>
      </div>
    </fieldset>
    <fieldset className="form-section"><legend>Buyurtma xabarlari</legend>
      <label className="field" htmlFor="sf-tg">Do‘kon egasining Telegram ID’si</label>
      <input id="sf-tg" name="telegramChatId" inputMode="numeric" pattern="[0-9]{1,16}" defaultValue={edit.telegramChatId} placeholder="Masalan: 123456789" />
      <ol className="field-steps">
        <li>Do‘kon egasi <a href="https://t.me/GulBarr_bot" target="_blank" rel="noreferrer">@GulBarr_bot</a> ga kirib <b>/start</b> bosadi.</li>
        <li>Keyin <b>/id</b> yuboradi, bot raqam qaytaradi.</li>
        <li>Shu raqamni yuqoriga yozing. Bo‘sh qolsa, buyurtma qabul qilinmaydi.</li>
      </ol>
    </fieldset>
    {needsLogin && <fieldset className="form-section"><legend>Do‘kon paneliga kirish</legend>{!isNew && <p className="field-help">Bu do‘konda hali login yo‘q. Egasi gul va narxlarni o‘zi boshqarishi uchun login va parol yarating.</p>}
      <label className="field" htmlFor="sf-login">Do‘kon logini</label>
      <input id="sf-login" name="login" value={login} onChange={e => { setTouched(true); setLogin(e.target.value.toLowerCase()); }} pattern="[a-z0-9._-]{3,40}" autoComplete="off" placeholder="masalan: madina.gullari" required={needsLogin} />
      <label className="field" htmlFor="sf-pass">Vaqtinchalik parol</label>
      <div className="pw-row">
        <input id="sf-pass" name="password" type={show ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} minLength={12} maxLength={128} autoComplete="new-password" required={needsLogin} />
        <button type="button" className="icon-btn" aria-label={show ? 'Parolni yashirish' : 'Parolni ko‘rsatish'} onClick={() => setShow(v => !v)}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
        <button type="button" className="pw-gen" onClick={() => { setPassword(makePassword()); setShow(true); }}><Sparkles size={15} /> Yaratish</button>
      </div>
      <p className="field-help">Kamida 12 belgi. Parolni faqat egasiga bering, birinchi kirishda u o‘zinikini qo‘yadi.</p>
    </fieldset>}
    <label className="merchant-checkbox"><input type="checkbox" name="active" defaultChecked={edit.active === true} /> Do‘konni katalogda ochish</label>
    {isNew && <p className="field-help">Do‘kon gul qo‘shgach ochilsa yaxshi. Xohlasangiz, keyin tahrirlab ochasiz.</p>}
    {error && <p className="error-banner" role="alert">{error}</p>}
    <button className="primary full" disabled={busy}>{busy ? 'Saqlanmoqda…' : 'Do‘konni saqlash'}</button>
    <button type="button" className="text-button full" onClick={onClose} disabled={busy}>Bekor qilish</button>
  </form>;
}

export function Admin({ back, reload, demo }: { back: () => void; reload: () => void; demo: boolean }) {
  const [auth, setAuth] = useState<AccountAuth | null>(null);
  const [shops, setShops] = useState<AdminShop[]>([]);
  const [edit, setEdit] = useState<Partial<AdminShop> | null>(null);
  const [manage, setManage] = useState<AdminShop | null>(null);
  const [access, setAccess] = useState<{ login: string; password: string } | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'all' | 'todo' | 'ready'>('all');
  const session = useRef(0);
  useEffect(() => () => { session.current++; }, []);
  async function load(key = auth?.token) {
    if (!key) return; const current = session.current;
    try { const rows = await api<AdminShop[]>('/admin/workspace', {}, key); if (session.current === current) { setShops(rows); setError(''); } }
    catch (e) { if (session.current !== current) return; if (e instanceof ApiError && e.status === 401) { setAuth(null); setShops([]); setEdit(null); setManage(null); setAccess(null); } setError((e as Error).message); }
  }
  function login(result: AccountAuth) { setAuth(result); load(result.token); }
  function logout() { if (auth) void api('/auth/logout', { method: 'POST' }, auth.token).catch(() => {}); session.current++; setAuth(null); setShops([]); setAccess(null); setError(''); setNotice(''); }
  async function save(data: FormData) {
    if (!auth) return; setBusy(true); setError(''); setNotice('');
    const name = String(data.get('name')).trim();
    const attempt = async (id: string) => {
      const shop = { id, name, subtitle: String(data.get('subtitle')), address: String(data.get('address')), deliveryFee: Number(data.get('deliveryFee')), deliveryTime: String(data.get('deliveryTime')), color: edit?.color || colorOf(name), initials: edit?.initials || initialsOf(name), active: data.get('active') === 'on', hours: data.get('always') === 'on' ? null : { open: String(data.get('hoursOpen')), close: String(data.get('hoursClose')) } };
      const body = { shop, phone: data.get('phone'), telegramChatId: data.get('telegramChatId'), login: data.get('login'), password: data.get('password') };
      await api(edit?.id ? `/admin/shops/${edit.id}/settings` : '/admin/onboard', { method: edit?.id ? 'PATCH' : 'POST', body: JSON.stringify(body) }, auth.token);
    };
    try {
      if (edit?.id) {
        await attempt(edit.id);
        const newLogin = String(data.get('login') || ''), newPassword = String(data.get('password') || '');
        if (!edit.login && newLogin && newPassword) {
          await api(`/admin/shops/${edit.id}/account`, { method: 'POST', body: JSON.stringify({ login: newLogin, password: newPassword }) }, auth.token);
          setAccess({ login: newLogin, password: newPassword });
        }
      } else {
        const base = slug(name).length >= 2 ? slug(name) : 'shop';
        try { await attempt(base); }
        catch (first) {
          // the generated id may already exist; retry once with a short suffix, otherwise show the server's message
          if (!/allaqachon/.test((first as Error).message)) throw first;
          await attempt(`${base.slice(0, 34)}-${crypto.randomUUID().slice(0, 4)}`);
        }
        setAccess({ login: String(data.get('login')), password: String(data.get('password')) });
      }
      setEdit(null); await load(); reload(); setNotice('Do‘kon saqlandi.');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function resetAccount(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!auth || !manage) return; const data = new FormData(e.currentTarget); setBusy(true); setError('');
    const password = String(data.get('password') || '');
    try { await api(`/admin/shops/${manage.id}/account`, { method: 'PATCH', body: JSON.stringify({ enabled: data.get('enabled') === 'on', ...(password ? { password } : {}) }) }, auth.token); if (password) setAccess({ login: manage.login, password }); setManage(null); await load(); setNotice('Hisob yangilandi. Avvalgi sessiyalar yopildi.'); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function copyAccess() { if (!access) return; try { await navigator.clipboard.writeText(`GulBar do‘kon paneli: ${location.origin}/merchant\nLogin: ${access.login}\nVaqtinchalik parol: ${access.password}\nBirinchi kirishda parolni almashtiring.`); setNotice('Kirish ma’lumotlari nusxalandi.'); } catch { setError('Nusxalab bo‘lmadi. Login va parolni qo‘lda yozib oling.'); } }

  const ready = (s: AdminShop) => s.active && steps(s).every(x => x.ok);
  const counts = { all: shops.length, ready: shops.filter(ready).length, todo: shops.filter(s => !ready(s)).length };
  const visible = shops.filter(s => (tab === 'all' || (tab === 'ready') === ready(s)) && `${s.name} ${s.login} ${s.address}`.toLowerCase().includes(query.toLowerCase().trim()));
  const tabs = [['all', 'Hammasi'], ['todo', 'Tayyor emas'], ['ready', 'Tayyor']] as const;

  return <main className="merchant admin page-content"><button className="text-button" onClick={back}><ArrowLeft size={18} /> Katalogga qaytish</button>
    <div className="page-heading"><div><p className="eyebrow">GulBar boshqaruvi</p><h1>Admin paneli</h1></div><Store size={30} strokeWidth={1.4} /></div>
    {demo && <p className="demo-note">Hozir demo rejimi. Yaratilgan do‘konlar va buyurtmalar demo bazasida saqlanadi; Telegram buyurtma xabarlari yuborilmaydi.</p>}
    {!auth ? <AccountLogin role="admin" onLogin={login} /> : <>
      <div className="merchant-toolbar"><span>{auth.user.login}</span><div><button className="secondary" disabled={busy} onClick={() => load()}><RefreshCw size={16} /> Yangilash</button><button className="text-button" onClick={logout}><LogOut size={16} /> Chiqish</button></div></div>
      <div className="adm-stats">
        <article><strong>{shops.length}</strong><span>Do‘konlar</span></article>
        <article><strong>{shops.filter(s => s.active).length}</strong><span>Katalogda ochiq</span></article>
        <article><strong>{shops.filter(s => s.telegramChatId).length}</strong><span>Telegram ulangan</span></article>
        <article><strong>{shops.reduce((n, s) => n + (s.products || 0), 0)}</strong><span>Gullar</span></article>
      </div>
      <SupportInbox token={auth.token} />
      <div className="merchant-section-heading"><div><h2>Do‘konlar</h2><p>Do‘kon buyurtma olishi uchun telefon, Telegram ID, login va kamida bitta gul kerak.</p></div><button className="primary" onClick={() => { setError(''); setEdit({}); }}><Plus size={18} /> Yangi do‘kon</button></div>
      <div className="adm-filter">
        <div className="adm-tabs" role="group" aria-label="Do‘konlar holati">{tabs.map(([id, label]) => <button key={id} aria-pressed={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{tab === id && <motion.span layoutId="adm-tab" className="adm-tab-bg" transition={{ type: 'spring', stiffness: 440, damping: 38 }} />}<span>{label} · {counts[id]}</span></button>)}</div>
        <label className="adm-search"><Search size={16} /><input type="search" aria-label="Do‘kon qidirish" value={query} onChange={e => setQuery(e.target.value)} placeholder="Nomi, login yoki manzil" /></label>
      </div>
      <div className="admin-shop-list">{visible.map((s, i) => {
        const list = steps(s), next = list.find(x => !x.ok), isReady = ready(s);
        return <motion.article key={s.id} className="adm-shop" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease, delay: Math.min(i, 8) * 0.04 }}>
          <div className="adm-shop-top">
            <span className="adm-avatar" style={{ background: s.color }}>{s.logo ? <img src={s.logo} alt="" /> : s.initials}</span>
            <div className="adm-shop-title"><h3>{s.name}</h3><p>{s.address}</p></div>
            <span className={`adm-state ${s.active ? 'open' : 'closed'}`}>{s.active ? 'Ochiq' : 'Yopiq'}</span>
          </div>
          <ul className="adm-steps" aria-label="Tayyorlik">{list.map(x => <li key={x.label} className={x.ok ? 'ok' : ''}>{x.ok ? <Check size={14} strokeWidth={2.4} /> : <Circle size={11} />}{x.label}</li>)}</ul>
          <p className={`adm-next${isReady ? ' done' : ''}`}>{isReady ? 'Tayyor — buyurtma qabul qila oladi.' : !s.active && !next ? 'Hamma narsa tayyor. Do‘konni katalogda oching.' : next ? `Keyingi qadam: ${next.todo}.` : ''}</p>
          <dl><div><dt>Login</dt><dd>{s.login || 'Eski kalit hisobi'}{s.login && !s.accountEnabled && ' · bloklangan'}</dd></div><div><dt>Yetkazish</dt><dd>{money(s.deliveryFee)} · {s.deliveryTime}</dd></div></dl>
          <div className="order-actions"><button className="secondary" onClick={() => { setError(''); setEdit(s); }}>Do‘konni tahrirlash</button>{s.login && <button className="secondary" onClick={() => { setError(''); setManage(s); }}>Login va parol</button>}</div>
        </motion.article>;
      })}</div>
      {!visible.length && <div className="empty"><Store size={38} /><h3>{shops.length ? 'Do‘kon topilmadi' : 'Hali do‘kon yo‘q'}</h3><p>{shops.length ? 'Filtr yoki qidiruvni o‘zgartiring.' : '«Yangi do‘kon» tugmasi bilan birinchi do‘konni qo‘shing.'}</p></div>}
      <div className="admin-process"><h2>Do‘konni ulash tartibi</h2><ol><li>Do‘kon va login hisobini yarating.</li><li>Panel havolasi, login va vaqtinchalik parolni egasiga bering.</li><li>Egasi parolni almashtirib, gullarini qo‘shadi.</li><li>Do‘konni oching — xaridor buyurtmasi uning Telegramiga tushadi.</li></ol></div>
    </>}{error && !edit && !manage && <p className="error-banner" role="alert">{error}</p>}{notice && <p className="merchant-notice" role="status">{notice}</p>}
    {edit && <Dialog title={edit.id ? 'Do‘konni tahrirlash' : 'Yangi do‘kon va hisob'} onClose={() => { if (!busy) setEdit(null); }}><ShopForm edit={edit} busy={busy} error={error} onSubmit={save} onClose={() => setEdit(null)} /></Dialog>}
    {manage && <Dialog title={`${manage.login} hisobi`} onClose={() => { if (!busy) setManage(null); }}><form className="product-form" onSubmit={resetAccount}><label className="field">Yangi vaqtinchalik parol<input name="password" type="password" minLength={12} maxLength={128} autoComplete="new-password" /></label><p className="field-help">Bo‘sh qoldirsangiz parol o‘zgarmaydi. Yangi parol qo‘yilganda egasi birinchi kirishda uni almashtiradi.</p><label className="merchant-checkbox"><input name="enabled" type="checkbox" defaultChecked={manage.accountEnabled} /> Login hisobi faol</label><p className="field-help">Saqlash avvalgi kirish sessiyalarini yopadi. Hisobni bloklash yangi kirishni ham to‘xtatadi.</p>{error && <p role="alert" className="error-banner">{error}</p>}<button className="primary full" disabled={busy}>Hisobni saqlash</button></form></Dialog>}
    {access && <Dialog title="Do‘kon egasiga beriladigan ma’lumotlar" onClose={() => setAccess(null)}><p className="field-help">Parol qayta ko‘rsatilmaydi. Hozir nusxalab, egasiga xavfsiz yo‘l bilan bering.</p><label className="field">Panel havolasi<input readOnly value={`${location.origin}/merchant`} /></label><label className="field">Login<input readOnly value={access.login} /></label><label className="field">Vaqtinchalik parol<input readOnly type="password" value={access.password} /></label><button className="primary full" onClick={copyAccess}><Copy size={16} /> Kirish ma’lumotlarini nusxalash</button>{notice && <p role="status" className="merchant-notice">{notice}</p>}<button className="text-button" onClick={() => setAccess(null)}>Ma’lumotlarni oldim</button></Dialog>}
  </main>;
}
