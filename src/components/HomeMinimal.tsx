import { Fragment, useEffect, useRef, useState, type CSSProperties } from 'react';
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'motion/react';
import { Check, Flower2, Heart, Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import type { CartItem, Catalog, Product, Shop } from '../types';
import { haptic, money } from '../lib/api';
import { sampleTint, type Tint } from '../lib/tint';
import { useFly } from './Fly';
import { RatingLine } from './Reviews';
import { shopStatus, useNow } from '../lib/hours-ui';
import { Dialog } from './Dialog';

const people = [
  { id: '', label: 'Hammasi' }, { id: 'ona', label: 'Onamga' }, { id: 'rafiqa', label: 'Rafiqamga' },
  { id: 'qiz', label: 'Qizimga' }, { id: 'dost', label: 'Do‘stimga' }, { id: 'hamkasb', label: 'Hamkasbimga' },
];
const ease = [0.22, 1, 0.36, 1] as const;

export type HomeFilters = { who: string; q: string; sort: 'recommended' | 'low' | 'high'; budget: string };
export const noFilters: HomeFilters = { who: '', q: '', sort: 'recommended', budget: '' };
const budgets = [
  { id: 'b1', label: '500 000 gacha', min: 0, max: 500000 }, { id: 'b2', label: '500 000 – 1 mln', min: 500000, max: 1000000 },
  { id: 'b3', label: '1 – 2 mln', min: 1000000, max: 2000000 }, { id: 'b4', label: '2 mln dan yuqori', min: 2000000, max: Infinity },
];
const sorts = [{ id: 'recommended', label: 'Tavsiya etilgan' }, { id: 'low', label: 'Avval arzonlari' }, { id: 'high', label: 'Avval qimmatlari' }] as const;
/** Anything read from storage is checked before it is used as a filter. */
export function readFilters(raw: unknown): HomeFilters {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    who: people.some(p => p.id === v.who) ? String(v.who) : '',
    q: typeof v.q === 'string' ? v.q.slice(0, 60) : '',
    sort: sorts.some(o => o.id === v.sort) ? v.sort as HomeFilters['sort'] : 'recommended',
    budget: budgets.some(b => b.id === v.budget) ? String(v.budget) : '',
  };
}
// apostrophes are typed in many ways in Uzbek (o‘, o', oʻ), so they are ignored when searching
const plain = (text: string) => text.toLocaleLowerCase('uz').replace(/[‘’ʻʼ'`]/g, '');
const nf = new Intl.NumberFormat('uz-UZ');

const quotes = [
  'Gul — so‘z topilmaganda aytiladigan eng chiroyli gap.',
  'Bir dasta gul kimningdir kunini yorug‘ qiladi.',
  'Mehr gul bilan yetib boradi.',
  'Kichik e’tibor katta quvonch uyg‘otadi.',
  'Eng yaxshi sovg‘a — o‘z vaqtida berilgan gul.',
  'Har bir guldastada kimningdir tabassumi yashiringan.',
  'Yaxshi kunlar gul bilan boshlanadi.',
  'Yaqinlaringizga gul — yuragingizdan salom.',
];

/** Warm one-liners that swap with a word-by-word reveal. Static when the visitor prefers reduced motion. */
function Quote() {
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const timer = setInterval(() => setI(n => (n + 1) % quotes.length), 5400);
    return () => clearInterval(timer);
  }, [reduce]);
  return <div className="gm-quote">
    <AnimatePresence mode="wait" initial={false}>
      <motion.p key={i} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.32, ease }}>
        {quotes[i].split(' ').map((word, k) => <Fragment key={k}><span className="gm-w"><motion.span initial={reduce ? false : { y: '115%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.75, ease, delay: 0.05 * k }}>{word}</motion.span></span>{' '}</Fragment>)}
      </motion.p>
    </AnimatePresence>
    {!reduce && <span key={i} className="gm-quote-line" aria-hidden="true" />}
  </div>;
}

type Props = {
  catalog: Catalog; favorites: string[]; cart: CartItem[]; shopFilter: string;
  setShopFilter: (id: string) => void; open: (product: Product) => void; add: (product: Product) => void;
  toggleFavorite: (id: string) => void; openShops: () => void; openShop?: (id: string) => void;
  filters?: HomeFilters; setFilters?: (filters: HomeFilters) => void;
};

function ShopDot({ shop, active, onClick, index }: { shop: Shop; active: boolean; onClick: () => void; index: number }) {
  const st = shopStatus(shop, useNow());
  const [logoFailed, setLogoFailed] = useState(false);
  return <motion.li initial={{ opacity: 0, y: 12, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.5, ease, delay: 0.25 + index * 0.06 }}>
    <button className={`gm-shop${active ? ' on' : ''}${st.hasHours ? (st.open ? ' is-open' : ' is-closed') : ''}`} onClick={onClick} aria-pressed={active} aria-label={shop.name}>
      <span className="gm-shop-ring">
        <span className="gm-shop-face" style={{ background: shop.color }}>
          {shop.logo && !logoFailed ? <img src={shop.logo} alt="" onError={() => setLogoFailed(true)} /> : <b>{shop.initials}</b>}
        </span>
      </span>
      <span className="gm-shop-name">{shop.name}</span>
      {st.hasHours && <span className="gm-shop-state">{st.open ? `${st.closesAt} gacha` : 'Yopiq'}</span>}
    </button>
  </motion.li>;
}

export function Item({ product, shop, tint, favorite, inCart, open, add, toggleFavorite, fly, openShop }: { product: Product; shop?: Shop; tint?: Tint; favorite: boolean; inCart: boolean; open: () => void; add: () => void; toggleFavorite: () => void; fly: (from: Element | null, src: string) => void; openShop?: () => void }) {
  const photo = useRef<HTMLDivElement>(null);
  const st = shopStatus(shop, useNow());
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const style = tint ? { '--ph': `hsl(${tint.h} ${Math.round(tint.s * 0.4)}% 90%)` } as CSSProperties : undefined;
  return <motion.li layout="position" className={`gm-item${product.stock ? '' : ' sold'}`} style={style}
    initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.15 }} exit={{ opacity: 0, scale: 0.98 }}
    transition={{ duration: 0.6, ease, layout: { type: 'spring', stiffness: 380, damping: 40 } }}>
    <div className="gm-photo" ref={photo}>
      <button className="gm-photo-btn" onClick={open} aria-label={`${product.name} haqida`}>
        {failed ? <Flower2 className="gm-missing" size={36} strokeWidth={1.1} aria-hidden="true" />
          : <img className={loaded ? 'in' : ''} src={product.image} alt={product.name} loading="lazy" onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />}
      </button>
      <button className={`gm-fav${favorite ? ' on' : ''}`} onClick={toggleFavorite} aria-label={`${product.name}: sevimlilar`} aria-pressed={favorite}>
        <motion.span animate={favorite ? { scale: [1, 1.4, 1] } : { scale: 1 }} transition={{ duration: 0.45, ease }}><Heart size={15} fill={favorite ? 'currentColor' : 'none'} strokeWidth={1.8} /></motion.span>
      </button>
      <motion.button whileTap={{ scale: 0.86 }} className={`gm-add${inCart ? ' in' : ''}`} disabled={!product.stock} onClick={() => { add(); fly(photo.current, product.image); }} aria-label={`${product.name}ni savatga qo‘shish`}>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={inCart ? 'in' : 'out'} initial={{ scale: 0.3, opacity: 0, rotate: -80 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} exit={{ scale: 0.3, opacity: 0 }} transition={{ type: 'spring', stiffness: 560, damping: 28 }}>
            {inCart ? <Check size={16} strokeWidth={2.2} /> : <Plus size={16} strokeWidth={1.7} />}
          </motion.span>
        </AnimatePresence>
      </motion.button>
      {!product.stock && <span className="gm-sold">Vaqtincha tugagan</span>}
    </div>
    <div className="gm-meta">
      <h3 className="gm-name"><button onClick={open}>{product.name}</button></h3>
      <p className="gm-price" aria-label={money(product.price)}><b>{nf.format(product.price)}</b> <small>so‘m</small></p>
      <p className="gm-shop-line">{openShop ? <button className="gm-shop-link" onClick={openShop}>{shop?.name}</button> : shop?.name}{shop?.rating ? <> <RatingLine rating={shop.rating} /></> : null}<span className="gm-sep" aria-hidden="true"> · </span><span className="gm-fee">yetkazish {nf.format(shop?.deliveryFee || 0)}</span></p>
      {st.hasHours && !st.open && <p className="gm-closed">Hozir yopiq · {st.opensAt} da ochiladi</p>}
    </div>
  </motion.li>;
}

export function HomeMinimal({ catalog, favorites, cart, shopFilter, setShopFilter, open, add, toggleFavorite, openShop, filters: given, setFilters: setGiven }: Props) {
  const { shops, products } = catalog;
  const [own, setOwn] = useState<HomeFilters>(noFilters);
  const filters = given || own;
  const setFilters = setGiven || setOwn;
  const { who, q: search, sort, budget } = filters;
  const patch = (part: Partial<HomeFilters>) => setFilters({ ...filters, ...part });
  const [sheet, setSheet] = useState(false);
  const { fly, layer } = useFly();
  const [tints, setTints] = useState<Record<string, Tint>>({});
  useEffect(() => {
    let live = true;
    products.forEach(p => sampleTint(p.image).then(t => { if (live && t) setTints(m => m[p.id]?.h === t.h ? m : { ...m, [p.id]: t }); }));
    return () => { live = false; };
  }, [products.map(p => p.image).join()]);

  const needle = plain(search.trim());
  const tier = budgets.find(b => b.id === budget);
  const matches = products.filter(p => (!who || !p.audience?.length || p.audience.includes(who)) && (shopFilter === 'all' || p.shopId === shopFilter)
    && (!tier || (p.price >= tier.min && p.price < tier.max))
    && (!needle || plain(`${p.name} ${shops.find(s => s.id === p.shopId)?.name || ''}`).includes(needle)));
  const list = sort === 'recommended' ? matches : [...matches].sort((a, b) => sort === 'low' ? a.price - b.price : b.price - a.price);
  const narrowed = sort !== 'recommended' || !!budget;
  const filtered = !!who || shopFilter !== 'all' || !!needle || narrowed;
  const reset = () => { setFilters(noFilters); setShopFilter('all'); };
  const shopName = shops.find(s => s.id === shopFilter)?.name;

  return <MotionConfig reducedMotion="user"><div className="gm-home">
    <header className="gm-hero">
      <motion.p className="gm-eyebrow" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, ease }}>{products.length} ta guldasta · {shops.length} ta do‘kon</motion.p>
      <h1 className="gm-title">
        <span className="gm-mask"><motion.span initial={{ y: '110%' }} animate={{ y: 0 }} transition={{ duration: 0.9, ease }}>Urganch</motion.span></span>{' '}
        <span className="gm-mask"><motion.em initial={{ y: '110%' }} animate={{ y: 0 }} transition={{ duration: 0.9, ease, delay: 0.1 }}>guldastalari</motion.em></span>
      </h1>
      <Quote />
      <motion.p className="gm-sub" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease, delay: 0.3 }}>Nomi, do‘koni yoki narxi bo‘yicha toping. To‘lov — yetkazilganda.</motion.p>
    </header>

    <ul className="gm-shops" aria-label="Do‘konlar">
      <motion.li initial={{ opacity: 0, y: 12, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.5, ease, delay: 0.2 }}>
        <button className={`gm-shop${shopFilter === 'all' ? ' on' : ''}`} onClick={() => setShopFilter('all')} aria-pressed={shopFilter === 'all'} aria-label="Hamma do‘konlar">
          <span className="gm-shop-ring"><span className="gm-shop-face all"><Flower2 size={26} strokeWidth={1.3} /></span></span>
          <span className="gm-shop-name">Hammasi</span>
        </button>
      </motion.li>
      {shops.map((s, i) => <ShopDot key={s.id} shop={s} index={i} active={shopFilter === s.id} onClick={() => setShopFilter(shopFilter === s.id ? 'all' : s.id)} />)}
    </ul>

    <div className="gm-tools">
      <label className="gm-search"><Search size={17} aria-hidden="true" />
        <input type="search" aria-label="Gul yoki do‘kon qidirish" placeholder="Gul yoki do‘kon nomi" value={search} maxLength={60} onChange={e => patch({ q: e.target.value })} />
        {search && <button type="button" className="gm-search-clear" aria-label="Qidiruvni tozalash" onClick={() => patch({ q: '' })}><X size={15} /></button>}
      </label>
      <button type="button" className={`gm-filter-btn${narrowed ? ' on' : ''}`} onClick={() => setSheet(true)} aria-label={narrowed ? 'Saralash va narx (tanlangan)' : 'Saralash va narx'}><SlidersHorizontal size={17} aria-hidden="true" /><span>Narx</span></button>
    </div>

    <div className="gm-bar">
      <div className="gm-chips" role="group" aria-label="Gul kimga?">
        {people.map(p => <button key={p.id || 'all'} className={`gm-chip${who === p.id ? ' on' : ''}`} aria-pressed={who === p.id} onClick={() => { haptic(); patch({ who: p.id }); }}>
          {who === p.id && <motion.span layoutId="gm-chip-bg" className="gm-chip-bg" transition={{ type: 'spring', stiffness: 440, damping: 38 }} />}
          <span>{p.label}</span>
        </button>)}
      </div>
    </div>

    <div className="gm-count">
      <h2>{shopName || 'Barcha guldastalar'}</h2>
      <p aria-live="polite">{shopFilter !== 'all' && openShop && <button className="gm-link" onClick={() => openShop(shopFilter)}>Do‘kon haqida</button>}{list.length} ta{filtered && <button className="gm-clear" onClick={reset}>Tozalash</button>}</p>
    </div>

    {products.length === 0 ? <p className="gm-empty">Hozircha gullar qo‘shilmagan.</p> : <ul className="gm-grid" id="catalog">
      <AnimatePresence mode="popLayout" initial>
        {list.map(p => <Item key={p.id} product={p} shop={shops.find(s => s.id === p.shopId)} tint={tints[p.id]}
          favorite={favorites.includes(p.id)} inCart={cart.some(c => c.productId === p.id)} open={() => open(p)} add={() => add(p)} toggleFavorite={() => toggleFavorite(p.id)} fly={fly} openShop={openShop ? () => openShop(p.shopId) : undefined} />)}
      </AnimatePresence>
    </ul>}
    {products.length > 0 && list.length === 0 && <div className="gm-empty"><p>Mos guldasta topilmadi.</p><button onClick={reset}>Hammasini ko‘rsatish</button></div>}
    {sheet && <Dialog title="Saralash va narx" onClose={() => setSheet(false)}>
      <div className="gm-sheet">
        <fieldset><legend>Tartib</legend>
          <div className="gm-opts" role="radiogroup" aria-label="Tartib">{sorts.map(o => <button key={o.id} type="button" role="radio" aria-checked={sort === o.id} className={sort === o.id ? 'on' : ''} onClick={() => { haptic(); patch({ sort: o.id }); }}>{o.label}</button>)}</div>
        </fieldset>
        <fieldset><legend>Budjet</legend>
          <div className="gm-opts" role="radiogroup" aria-label="Budjet">
            <button type="button" role="radio" aria-checked={!budget} className={!budget ? 'on' : ''} onClick={() => { haptic(); patch({ budget: '' }); }}>Hammasi</button>
            {budgets.map(b => <button key={b.id} type="button" role="radio" aria-checked={budget === b.id} className={budget === b.id ? 'on' : ''} onClick={() => { haptic(); patch({ budget: b.id }); }}>{b.label}</button>)}
          </div>
        </fieldset>
        <button type="button" className="primary full" onClick={() => setSheet(false)}>{list.length} ta guldastani ko‘rish</button>
        {narrowed && <button type="button" className="text-button full" onClick={() => patch({ sort: 'recommended', budget: '' })}>Tartib va budjetni tozalash</button>}
      </div>
    </Dialog>}
    {layer}
  </div></MotionConfig>;
}
