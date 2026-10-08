import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from 'react';
import { AnimatePresence, motion, MotionConfig, useReducedMotion } from 'motion/react';
import { Flower2, MapPin, ChevronDown, ArrowUpRight, ArrowRight, Search, SlidersHorizontal, Heart, ShoppingBag, Store, Package, X, Truck, Clock3, CheckCircle2, ShieldCheck, UserRound } from 'lucide-react';
import type { CartItem, Catalog, Order, Product } from './types';
import { api, money, readStored, writeStored, haptic, statusNames } from './lib/api';
import { ProductCard } from './components/ProductCard';
import { Dialog } from './components/Dialog';
import { Checkout } from './components/Checkout';
// panels and the older home drafts are only needed by a few visitors, so they load on demand
const Merchant = lazy(() => import('./components/Merchant').then(m => ({ default: m.Merchant })));
const Admin = lazy(() => import('./components/Admin').then(m => ({ default: m.Admin })));
const Home = lazy(() => import('./components/Home').then(m => ({ default: m.Home })));
const HomeFeed = lazy(() => import('./components/HomeFeed').then(m => ({ default: m.HomeFeed })));
const HomeWheel = lazy(() => import('./components/HomeWheel').then(m => ({ default: m.HomeWheel })));
const fallback = <main className="page-content loading-page"><div className="skeleton hero-skeleton" /><p role="status">Yuklanmoqda…</p></main>;
import { HomeMinimal, noFilters, readFilters, type HomeFilters } from './components/HomeMinimal';
import { CancelReason } from './components/CancelReason';
import { ProductSheet } from './components/ProductSheet';
import { ShopPage } from './components/ShopPage';
import { ReviewDialog } from './components/Reviews';
import { Star, RotateCcw, Check as CheckIcon, Ban, LifeBuoy, Store as StoreIcon } from 'lucide-react';
import { SupportDialog, HelpPanel } from './components/Support';
import { deliveryLabel } from '../server/delivery.js';

const categories = [{ id: 'all', name: 'Barchasi' }, { id: 'bouquet', name: 'Guldastalar' }, { id: 'rose', name: 'Atirgullar' }, { id: 'tulip', name: 'Lolalar' }, { id: 'box', name: 'Gul qutilari' }];
type Page = 'home' | 'shops' | 'shop' | 'favorites' | 'orders' | 'profile' | 'merchant' | 'admin';

// The minimal grid is the default home; earlier drafts stay available at /?home=wheel, /?home=feed and /?home=picker.
const homeParam = new URLSearchParams(location.search).get('home');
const homeVariant = homeParam === 'picker' || homeParam === 'feed' || homeParam === 'wheel' ? homeParam : 'minimal';

const HOME_KEY = 'gulbar-home';
function readHome(): { filters: HomeFilters; shop: string } {
  try { const raw = JSON.parse(sessionStorage.getItem(HOME_KEY) || '{}'); return { filters: readFilters(raw.filters), shop: typeof raw.shop === 'string' ? raw.shop.slice(0, 64) : 'all' }; }
  catch { return { filters: noFilters, shop: 'all' }; }
}
/** Runs when a page mounts: puts the scroll back where the buyer left it (or at the top). */
function ScrollRestore({ target }: { target: MutableRefObject<number | null> }) {
  useLayoutEffect(() => { if (target.current != null) { window.scrollTo({ top: target.current, behavior: 'instant' }); target.current = null; } }, [target]);
  return null;
}

export default function App() {
  const reduceMotion = useReducedMotion();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loadError, setLoadError] = useState('');
  const [page, setPage] = useState<Page>(location.pathname === '/admin' ? 'admin' : location.pathname === '/merchant' ? 'merchant' : new URLSearchParams(location.search).get('orders') ? 'orders' : 'home');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [home] = useState(readHome);
  const [shopFilter, setShopFilter] = useState(home.shop);
  const [homeFilters, setHomeFilters] = useState<HomeFilters>(home.filters);
  const scrolls = useRef<Record<string, number>>({});
  const restore = useRef<number | null>(null);
  const cartRef = useRef<CartItem[]>([]);
  const [cartNotes, setCartNotes] = useState<string[]>([]);
  const [sort, setSort] = useState('recommended');
  const [favorites, setFavorites] = useState<string[]>(() => { const data = readStored<unknown>('flowrs-favorites', []); return Array.isArray(data) ? data.filter(v => typeof v === 'string') : []; });
  const [cart, setCart] = useState<CartItem[]>(() => { const data = readStored<unknown>('flowrs-cart', []); return Array.isArray(data) ? data.filter(i => i && typeof i.productId === 'string' && Number.isInteger(i.quantity) && i.quantity > 0 && i.quantity <= 20) : []; });
  const [selected, setSelected] = useState<Product | null>(null);
  const [shopId, setShopId] = useState('');
  const [reviewing, setReviewing] = useState<Order | null>(null);
  const [cancelling, setCancelling] = useState<Order | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [support, setSupport] = useState<{ order: Order | null } | null>(null);
  const [supportKey, setSupportKey] = useState(0);
  const [checkout, setCheckout] = useState(false);
  const [switchProduct, setSwitchProduct] = useState<Product | null>(null);
  const [success, setSuccess] = useState<Order | null>(null);
  const [info, setInfo] = useState(false);
  const [toast, setToast] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderError, setOrderError] = useState('');
  const [ordersBusy, setOrdersBusy] = useState(false);
  const load = useCallback(async () => {
    try { const data = await api<Catalog>('/catalog'); setCatalog(data); setLoadError(''); } catch (e) { setLoadError((e as Error).message); }
  }, []);
  const loadOrders = useCallback(async () => {
    setOrdersBusy(true);
    try { setOrders(await api<Order[]>('/orders')); setOrderError(''); } catch (e) { setOrderError((e as Error).message); } finally { setOrdersBusy(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  // a shared link (?product=ID) opens that bouquet once the catalog is here
  useEffect(() => {
    if (!catalog) return;
    const id = new URLSearchParams(location.search).get('product');
    const found = id ? catalog.products.find(x => x.id === id) : undefined;
    if (found) { history.replaceState(null, '', location.pathname); setSelected(found); }
  }, [catalog]);
  useEffect(() => { writeStored('flowrs-favorites', favorites); }, [favorites]);
  useEffect(() => { writeStored('flowrs-cart', cart); cartRef.current = cart; }, [cart]);
  useEffect(() => { try { sessionStorage.setItem(HOME_KEY, JSON.stringify({ filters: homeFilters, shop: shopFilter })); } catch { /* private mode: the filters just reset next time */ } }, [homeFilters, shopFilter]);
  // a saved cart can be out of date (a bouquet was hidden, sold out or removed): fix it as soon as the catalog arrives and say what changed
  useEffect(() => {
    if (!catalog) return;
    const next: CartItem[] = [], notes: string[] = [];
    let removed = 0;
    for (const item of cartRef.current) {
      const p = catalog.products.find(x => x.id === item.productId);
      if (!p) { removed++; continue; }
      if (p.stock < 1) { notes.push(`«${p.name}» hozir tugagan, savatdan olib tashlandi.`); continue; }
      if (item.quantity > p.stock) { notes.push(`«${p.name}» dan faqat ${p.stock} ta qoldi, miqdor shunga tushirildi.`); next.push({ ...item, quantity: p.stock }); continue; }
      next.push(item);
    }
    if (removed) notes.push(`${removed} ta gul endi sotuvda yo‘q, savatdan olib tashlandi.`);
    if (!notes.length) return;
    setCart(next); setCartNotes(notes); setToast('Savat yangilandi. Tafsilot savatda.');
  }, [catalog]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 2500); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { if (page !== 'orders') return; loadOrders(); const timer = setInterval(loadOrders, 15000); return () => clearInterval(timer); }, [page, loadOrders]);
  useEffect(() => {
    const app = window.Telegram?.WebApp;
    if (!app || !app.initData) return;
    app.ready(); app.expand();
    const theme = () => {
      document.documentElement.dataset.theme = app.colorScheme;
      if (app.isVersionAtLeast('6.1')) { app.setHeaderColor(app.colorScheme === 'dark' ? '#0e1615' : '#f6f7f5'); app.setBackgroundColor(app.colorScheme === 'dark' ? '#0e1615' : '#f6f7f5'); }
    };
    const safe = () => {
      document.documentElement.style.setProperty('--tg-safe-top', `${app.contentSafeAreaInset?.top || 0}px`);
      document.documentElement.style.setProperty('--tg-safe-bottom', `${app.contentSafeAreaInset?.bottom || 0}px`);
    };
    theme(); safe(); app.onEvent('themeChanged', theme); app.onEvent('contentSafeAreaChanged', safe);
    return () => { app.offEvent('themeChanged', theme); app.offEvent('contentSafeAreaChanged', safe); };
  }, []);
  const closeOverlay = useCallback(() => { setSelected(null); setCheckout(false); setSwitchProduct(null); setSuccess(null); setInfo(false); setReviewing(null); setCancelling(null); setSupport(null); }, []);
  useEffect(() => {
    const app = window.Telegram?.WebApp;
    if (!app?.initData) return;
    const back = () => { if (checkout || selected || switchProduct || success || info || reviewing || cancelling || support) closeOverlay(); else navigate('home', true); };
    if (page !== 'home' || checkout || selected || success || switchProduct || info || reviewing || cancelling || support) app.BackButton.show(); else app.BackButton.hide();
    app.BackButton.onClick(back); return () => app.BackButton.offClick(back);
  }, [page, checkout, selected, switchProduct, success, info, reviewing, cancelling, support, closeOverlay]);

  // going back returns to where the buyer was; going forward starts at the top
  function navigate(next: Page, back = false) {
    scrolls.current[page] = window.scrollY;
    if (back) restore.current = scrolls.current[next] ?? 0;
    else { restore.current = null; window.scrollTo({ top: 0, behavior: 'instant' }); }
    setPage(next);
  }
  function openShop(id: string) { setSelected(null); setShopId(id); navigate('shop'); }
  function reorder(o: Order) {
    if (!catalog) return;
    const items = o.items.map(i => { const p = catalog.products.find(x => x.id === i.productId); return p && p.stock > 0 ? { productId: p.id, quantity: Math.min(i.quantity, p.stock, 20) } : null; }).filter((i): i is CartItem => !!i);
    if (!items.length) { setToast('Bu gullar hozir sotuvda yo‘q. Boshqa guldasta tanlang.'); return; }
    setCart(items); navigate('home'); setCheckout(true);
  }
  async function cancelOrder() {
    if (!cancelling) return;
    setCancelBusy(true); setCancelError('');
    try { await api(`/orders/${cancelling.id}/cancel`, { method: 'POST' }); setCancelling(null); await loadOrders(); load(); setToast('Buyurtma bekor qilindi. Gullar do‘konga qaytarildi.'); }
    catch (e) { setCancelError((e as Error).message); loadOrders(); } finally { setCancelBusy(false); }
  }
  function favorite(id: string) { haptic(); setFavorites(f => f.includes(id) ? f.filter(i => i !== id) : [...f, id]); }
  function add(product: Product, replace = false) {
    if (!catalog || !product.stock) return;
    const currentShop = catalog.products.find(p => p.id === cart[0]?.productId)?.shopId;
    if (currentShop && currentShop !== product.shopId && !replace) { setSelected(null); setSwitchProduct(product); return; }
    const base = replace ? [] : cart;
    const existing = base.find(i => i.productId === product.id);
    if ((existing?.quantity || 0) >= Math.min(product.stock, 20)) { setToast('Mavjud sonidan ortiq qo‘shib bo‘lmaydi.'); return; }
    setCart(existing ? base.map(i => i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i) : [...base, { productId: product.id, quantity: 1 }]);
    setToast('Guldasta savatga qo‘shildi'); haptic(); setSwitchProduct(null);
  }
  function changeQuantity(id: string, delta: number) {
    const stock = catalog?.products.find(p => p.id === id)?.stock || 0;
    setCart(items => items.map(i => i.productId === id ? { ...i, quantity: Math.min(Math.min(stock, 20), i.quantity + delta) } : i).filter(i => i.quantity > 0));
  }
  const cartSubtotal = cart.reduce((sum, item) => sum + (catalog?.products.find(p => p.id === item.productId)?.price || 0) * item.quantity, 0);
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);
  const filtered = (catalog?.products || []).filter(p => (category === 'all' || p.category === category) && (shopFilter === 'all' || p.shopId === shopFilter) && (page !== 'favorites' || favorites.includes(p.id)) && `${p.name} ${catalog?.shops.find(s => s.id === p.shopId)?.name}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  if (sort === 'low') filtered.sort((a, b) => a.price - b.price);
  if (sort === 'high') filtered.sort((a, b) => b.price - a.price);
  const navItems: { page: Page; label: string; icon: typeof Flower2 }[] = [{ page: 'home', label: 'Gullar', icon: Flower2 }, { page: 'shops', label: 'Do‘konlar', icon: Store }, { page: 'favorites', label: 'Sevimlilar', icon: Heart }, { page: 'orders', label: 'Buyurtmalar', icon: Package }];

  const homeProps = { catalog: catalog!, favorites, cart, shopFilter, setShopFilter, filters: homeFilters, setFilters: setHomeFilters, open: setSelected, add: (p: Product) => add(p), toggleFavorite: favorite, openShops: () => navigate('shops'), openShop };
  const HOME_MINIMAL = catalog && <HomeMinimal {...homeProps} />;
  const HOME_WHEEL = catalog && <Suspense fallback={fallback}><HomeWheel {...homeProps} /></Suspense>;
  const HOME_FEED = catalog && <Suspense fallback={fallback}><HomeFeed {...homeProps} /></Suspense>;
  const HOME_PICKER = catalog && <Suspense fallback={fallback}><Home {...homeProps} /></Suspense>;

  return <MotionConfig reducedMotion="user"><div className={`app-shell${page === 'home' ? ` home-view home-${homeVariant === 'picker' ? 'picker' : homeVariant}` : (page === 'admin' || page === 'merchant') ? ' home-view home-minimal panel-view' : page === 'shop' ? ' home-view home-minimal' : ''}`}>
    <header className="site-header"><div className="header-inner"><button className="brand" onClick={() => navigate('home')} aria-label="GulBar bosh sahifa"><Flower2 className="brand-flower" size={32} strokeWidth={1.7} /><span>GulBar<span className="brand-dot">.</span></span></button>
      <button className="location" onClick={() => setInfo(true)}><MapPin size={18} /><span><small>Yetkazish shahri</small><strong>Urganch</strong></span><ChevronDown size={15} /></button>
      <nav className="desktop-nav" aria-label="Asosiy menyu">{navItems.map(({ page: p, label }) => <button className={page === p ? 'active' : ''} key={p} onClick={() => navigate(p)}>{label}</button>)}</nav>
      <div className="header-actions"><button className="icon-btn profile-button" onClick={() => navigate('profile')} aria-label="Profil"><UserRound size={22} /></button><button className="bag-button" onClick={() => setCheckout(true)} aria-label={`Savat, ${cartCount} ta gul`}><ShoppingBag size={20} /><span className="bag-label">Savat</span><motion.span key={cartCount} className="bag-count" initial={reduceMotion ? false : { scale: 1.7 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 520, damping: 16 }}>{cartCount}</motion.span></button></div>
    </div></header>
    <AnimatePresence mode="wait" initial={false}><motion.div key={catalog ? page : "loading"} className="page-fade" initial={reduceMotion ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: .24, ease: [0.22, 1, 0.36, 1] }}>
    <ScrollRestore target={restore} />
    {!catalog ? <main className="page-content loading-page">{loadError ? <div className="empty"><Flower2 size={40} /><h1>Katalogni ochib bo‘lmadi</h1><p role="alert">{loadError}</p><button className="primary" onClick={load}>Qayta urinish</button></div> : <><div className="skeleton hero-skeleton" /><div className="product-grid">{[1, 2, 3, 4].map(n => <div key={n} className="skeleton card-skeleton" />)}</div><p role="status">Gullar yuklanmoqda…</p></>}</main> : page === 'admin' ? <Suspense fallback={fallback}><Admin demo={catalog.demo} back={() => navigate('home', true)} reload={load} /></Suspense> : page === 'merchant' ? <Suspense fallback={fallback}><Merchant catalog={catalog} back={() => navigate('home', true)} reload={load} /></Suspense> : page === 'shop' && catalog.shops.some(x => x.id === shopId) ? <ShopPage shop={catalog.shops.find(x => x.id === shopId)!} catalog={catalog} favorites={favorites} cart={cart} back={() => navigate('home', true)} open={setSelected} add={p => add(p)} toggleFavorite={favorite} /> : <main className="page-content">
      {catalog.demo && <div className="demo-bar"><span className="demo-dot" /> Demo ko‘rinish <span className="demo-extra">· do‘konlar va narxlar namunaviy</span><button onClick={() => setInfo(true)}>Batafsil <ArrowUpRight size={13} /></button></div>}
      {page === 'home' && (homeVariant === 'feed' ? HOME_FEED : homeVariant === 'picker' ? HOME_PICKER : homeVariant === 'wheel' ? HOME_WHEEL : HOME_MINIMAL)}

      {page === 'favorites' && <section id="catalog" className="catalog-section"><div className="section-heading catalog-heading"><div><h2>Ko‘nglingizga yoqqan gullar</h2><p>Saqlangan guldastalaringiz shu yerda</p></div><label className="search"><Search size={18} /><input aria-label="Gul yoki do‘kon qidirish" placeholder="Gul yoki do‘kon qidirish" value={query} onChange={e => setQuery(e.target.value)} />{query && <button aria-label="Qidiruvni tozalash" onClick={() => setQuery('')}><X size={16} /></button>}</label></div>
        <div className="catalog-toolbar"><div className="categories" aria-label="Gul kategoriyalari">{categories.map(c => <button key={c.id} className={category === c.id ? 'active' : ''} aria-pressed={category === c.id} onClick={() => { setCategory(c.id); haptic(); }}>{c.id === 'all' && <Flower2 size={16} />}<span>{c.name}</span></button>)}</div><label className="sort"><SlidersHorizontal size={16} /><select aria-label="Narx bo‘yicha tartiblash" value={sort} onChange={e => setSort(e.target.value)}><option value="recommended">Tavsiya etilgan</option><option value="low">Avval arzonlari</option><option value="high">Avval qimmatlari</option></select></label></div>
        {shopFilter !== 'all' && <button className="filter-chip" onClick={() => setShopFilter('all')}>{catalog.shops.find(s => s.id === shopFilter)?.name}<X size={15} /> Barcha do‘konlar</button>}
        <div className="product-grid">{filtered.map(p => <ProductCard key={p.id} product={p} shop={catalog.shops.find(s => s.id === p.shopId)} favorite={favorites.includes(p.id)} inCart={cart.some(i => i.productId === p.id)} toggleFavorite={() => favorite(p.id)} add={() => add(p)} open={() => setSelected(p)} />)}</div>
        {!filtered.length && <div className="empty"><Flower2 size={42} /><h3>{page === 'favorites' && !favorites.length ? 'Sevimli gullaringizni saqlang' : !catalog.products.length ? 'Hozircha gullar qo‘shilmagan' : 'Mos guldasta topilmadi'}</h3><p>{page === 'favorites' && !favorites.length ? 'Guldastadagi yurak belgisini bosing.' : !catalog.products.length ? 'Do‘konlar qo‘shgan gullar shu yerda ko‘rinadi.' : 'Boshqa kategoriya yoki qidiruvni sinab ko‘ring.'}</p>{!!catalog.products.length && <button className="secondary" onClick={() => { setCategory('all'); setShopFilter('all'); setQuery(''); navigate('home'); }}>Barcha gullar</button>}</div>}
      </section>}
      {page === 'shops' && <section className="shops-section"><div className="section-heading"><div><h2>Urganchdagi do‘konlar</h2><p>O‘zingizga yaqin uslubni toping</p></div></div><div className="shop-grid">{catalog.shops.map(shop => <button key={shop.id} className={`shop-card ${shopFilter === shop.id ? 'selected' : ''}`} onClick={() => { setShopFilter(shopFilter === shop.id ? 'all' : shop.id); setPage('home'); setCategory('all'); }} aria-pressed={shopFilter === shop.id}><span className="shop-avatar" style={{ background: shop.color }}>{shop.initials}</span><span className="shop-card-copy"><strong>{shop.name}</strong><small>{shop.subtitle}</small><span><Truck size={13} /> {money(shop.deliveryFee)}</span></span><ArrowUpRight className="shop-arrow" size={19} /></button>)}</div>{catalog.shops.length === 0 && <div className="empty"><Store size={35} /><h3>Do‘konlar tez orada qo‘shiladi</h3><p>Urganchdagi hamkorlar katalogi tayyorlanmoqda.</p></div>}</section>}
      {page === 'orders' && <section><div className="section-heading"><div><h1>Buyurtmalaringiz</h1><p>Gullaringiz qayerga yetganini kuzating</p></div><button className="secondary" onClick={loadOrders} disabled={ordersBusy}>{ordersBusy ? 'Yuklanmoqda…' : 'Yangilash'}</button></div>{orderError && <p className="error-banner" role="alert">{orderError}</p>}{!orders.length && !ordersBusy && !orderError && <div className="empty"><Package size={42} /><h3>Ilk guldastangiz kutmoqda</h3><p>Buyurtma berganingizdan keyin uning holati shu yerda ko‘rinadi.</p><button className="primary" onClick={() => navigate('home')}>Guldasta tanlash</button></div>}<div className="customer-orders">{orders.map(o => <article className="order-card" key={o.id}><header><div><strong>{o.shopName}</strong><p>#{o.id.slice(0, 8)} · {new Date(o.createdAt).toLocaleDateString('uz-UZ', { timeZone: 'Asia/Tashkent' })}</p></div><span className={`status ${o.status}`}>{statusNames[o.status]}</span></header>{o.demo && <p className="demo-note">Demo buyurtma · do‘konga yuborilmagan</p>}<div className="order-products">{o.items.map(i => <div key={i.productId}><img src={i.image} alt={i.name} /><div><strong>{i.name}</strong><p>{i.quantity} dona · {money(i.price)}</p></div></div>)}</div>{o.status !== 'cancelled' && <div className="order-progress" aria-label={`Holat: ${statusNames[o.status]}`}>{['pending', 'accepted', 'delivering', 'delivered'].map((s, i) => <div key={s} className={i <= ['pending', 'accepted', 'delivering', 'delivered'].indexOf(o.status) ? (i < ['pending', 'accepted', 'delivering', 'delivered'].indexOf(o.status) ? 'done next-done' : 'done') : ''}><span>{i + 1}</span><small>{['Kutilmoqda', 'Qabul qilindi', 'Yo‘lda', 'Yetkazildi'][i]}</small></div>)}</div>}<div className="order-line"><span>Yetkazish bilan jami</span><strong>{money(o.total)}</strong></div><p className="delivery-address">{o.delivery?.method === 'pickup' ? <StoreIcon size={15} /> : <MapPin size={15} />}{o.delivery?.method === 'pickup' ? `Do‘kondan olib ketasiz · ${o.customer.address}` : o.customer.address}</p>{deliveryLabel(o) && <p className="delivery-when"><Clock3 size={15} />{deliveryLabel(o)}</p>}{o.status === 'cancelled' && <CancelReason order={o} shop={catalog.shops.find(x => x.id === o.shopId)} onOtherShop={() => { setShopFilter('all'); navigate('home'); }} />}<div className="order-foot">{o.status === 'delivered' && !o.reviewed && <button className="secondary" onClick={() => setReviewing(o)}><Star size={16} /> Baho berish</button>}{o.reviewed && <span className="reviewed-note"><CheckIcon size={14} /> Baho qoldirildi</span>}{['delivered', 'cancelled'].includes(o.status) && <button className="secondary" onClick={() => reorder(o)}><RotateCcw size={16} /> Qayta buyurtma</button>}{o.status === 'pending' && <button className="secondary danger" onClick={() => { setCancelError(''); setCancelling(o); }}><Ban size={16} /> Bekor qilish</button>}<button className="text-button help-link" onClick={() => setSupport({ order: o })}><LifeBuoy size={15} /> Shikoyat / yordam</button></div>{!o.demo && ['queued', 'retrying'].includes(o.notification) && <p className="muted">Do‘konga xabar yuborish navbatida. Holat avtomatik yangilanadi.</p>}</article>)}</div></section>}
      {page === 'profile' && <section className="profile"><div className="profile-avatar"><UserRound size={32} /></div><h1>{window.Telegram?.WebApp.initDataUnsafe?.user?.first_name || 'Xush kelibsiz'}</h1><p>GulBar — gullar bilan yaqinroq</p><div className="profile-links"><button onClick={() => navigate('orders')}><Package /> Buyurtmalarim <ArrowRight /></button><button onClick={() => navigate('favorites')}><Heart /> Sevimli gullarim <ArrowRight /></button><button onClick={() => setInfo(true)}><MapPin /> Yetkazib berish haqida <ArrowRight /></button><button onClick={() => navigate('merchant')}><Store /> Do‘kon paneli <ArrowRight /></button></div><HelpPanel refreshKey={supportKey} write={() => setSupport({ order: null })} /><p className="muted">Buyurtma uchun telefon va manzil faqat rasmiylashtirishda so‘raladi.</p></section>}
      <footer className="footer"><span className="footer-brand">GulBar.</span><p>Urganch uchun, mehr bilan.</p><button className="text-button" onClick={() => navigate('merchant')}>Do‘kon paneli <ArrowUpRight size={14} /></button><button className="text-button" onClick={() => navigate('admin')}>Admin paneli <ShieldCheck size={14} /></button></footer>
    </main>}
    </motion.div></AnimatePresence>
    <nav className="mobile-nav" aria-label="Pastki menyu">{navItems.map(({ page: p, label, icon: Icon }) => <button key={p} className={page === p ? 'active' : ''} onClick={() => navigate(p)}><Icon size={21} /><span>{label}</span></button>)}<button className={page === 'profile' ? 'active' : ''} onClick={() => navigate('profile')}><UserRound size={21} /><span>Profil</span></button></nav>
    <AnimatePresence>{page === 'home' && cartCount > 0 && <motion.button className="home-cart-bar" key="home-cart" initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} onClick={() => setCheckout(true)} aria-label="Savatni ochish"><span className="home-cart-icon"><ShoppingBag size={21} /><b>{cartCount}</b></span><span className="home-cart-copy"><strong>Savat</strong><small>{money(cartSubtotal)}</small></span><ArrowRight size={18} /></motion.button>}</AnimatePresence>
    <AnimatePresence>{toast && <motion.div key="toast" className="toast" role="status" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><CheckCircle2 size={19} />{toast}<button onClick={() => { setToast(''); setCheckout(true); }}>Savat</button></motion.div>}</AnimatePresence>
    {selected && catalog && <Dialog title={selected.name} onClose={() => setSelected(null)}><ProductSheet product={selected} shop={catalog.shops.find(x => x.id === selected.shopId)} onAdd={() => { add(selected); setSelected(null); }} onOpenShop={() => openShop(selected.shopId)} /></Dialog>}
    {reviewing && <ReviewDialog order={reviewing} onClose={() => setReviewing(null)} onDone={() => { setReviewing(null); loadOrders(); load(); setToast('Rahmat! Bahoyingiz qabul qilindi.'); }} />}
    {cancelling && <Dialog title="Buyurtmani bekor qilasizmi?" onClose={() => { if (!cancelBusy) setCancelling(null); }}><div className="switch-content"><Ban size={34} /><p>{cancelling.shopName} buyurtmani hali qabul qilmagan. Bekor qilsangiz, gullar do‘konga qaytariladi va do‘konga xabar boradi.</p>{cancelError && <p className="error-banner" role="alert">{cancelError}</p>}<button className="primary full danger" disabled={cancelBusy} onClick={cancelOrder}>{cancelBusy ? 'Bekor qilinmoqda…' : 'Ha, bekor qilish'}</button><button className="secondary full" disabled={cancelBusy} onClick={() => setCancelling(null)}>Yo‘q, qoldiraman</button></div></Dialog>}
    {support && <SupportDialog order={support.order} onClose={() => setSupport(null)} onDone={() => { setSupport(null); setSupportKey(k => k + 1); setToast('Murojaatingiz yuborildi. Javobni Profil bo‘limida ko‘rasiz.'); }} />}
    {checkout && catalog && <Checkout catalog={catalog} cart={cart} notes={cartNotes} dismissNotes={() => setCartNotes([])} change={changeQuantity} onClose={() => setCheckout(false)} complete={order => { setCheckout(false); setCart([]); setSuccess(order); load(); }} />}
    {switchProduct && <Dialog title="Boshqa do‘kondan tanladingiz" onClose={() => setSwitchProduct(null)}><div className="switch-content"><Store size={36} /><p>Bitta buyurtma bitta do‘konga tegishli. Yangi guldastani tanlash uchun hozirgi savat almashtiriladi.</p><button className="primary full" onClick={() => add(switchProduct, true)}>Savatni almashtirish</button><button className="secondary full" onClick={() => setSwitchProduct(null)}>Hozirgi savatni saqlash</button></div></Dialog>}
    {success && <Dialog title={success.demo ? 'Demo buyurtma saqlandi' : 'Buyurtma yuborildi'} onClose={() => setSuccess(null)}><div className="success-content"><motion.span className="success-icon" initial={reduceMotion ? false : { scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 18 }}><svg width="58" height="58" viewBox="0 0 58 58" fill="none" aria-hidden="true"><motion.circle cx="29" cy="29" r="26" stroke="currentColor" strokeWidth="2.4" initial={reduceMotion ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: .6, ease: [0.22, 1, 0.36, 1] }} /><motion.path d="M18 30l8 8 15-18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" initial={reduceMotion ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: .4, delay: .45, ease: "easeOut" }} /></svg></motion.span><h3>{success.demo ? 'Buyurtma oqimi tayyor!' : 'Gullar bilan quvonch yo‘lda'}</h3><p>{success.demo ? 'Bu sinov buyurtmasi. Haqiqiy do‘konga xabar yuborilmadi va yetkazib berish boshlanmaydi.' : 'Buyurtmangiz saqlandi. Do‘konga xabar yuboriladi; tasdiqlashini Buyurtmalar bo‘limida kuzating.'}</p><div className="success-receipt"><span>{success.shopName}</span><strong>{money(success.total)}</strong><small>Buyurtma #{success.id.slice(0, 8)}</small></div><button className="primary full" onClick={() => { setSuccess(null); navigate('orders'); }}>Buyurtmani ko‘rish <ArrowRight size={18} /></button></div></Dialog>}
    {info && <Dialog title="Urganch bo‘ylab yetkazish" onClose={() => setInfo(false)}><div className="info-content"><MapPin size={36} /><h3>Gullar — do‘kondan manzilingizga</h3><p>Hozir GulBar faqat Urganch uchun mo‘ljallangan. Har bir do‘kon buyurtmani o‘zi tayyorlaydi va yetkazadi.</p><p>Yetkazish haqi savatda ko‘rsatiladi. Aniq vaqtni do‘kon buyurtmani qabul qilgach tasdiqlaydi. To‘lov yetkazilganda qilinadi.</p>{catalog?.demo && <p className="demo-note">Do‘kon nomlari, manzillari, mahsulotlar, narxlar va rasmlar namuna. Haqiqiy hamkorlar hali ulanmagan.</p>}<button className="primary full" onClick={() => setInfo(false)}>Tushunarli</button></div></Dialog>}
  </div></MotionConfig>;
}

