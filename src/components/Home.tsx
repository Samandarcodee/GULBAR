import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { AnimatePresence, MotionConfig, animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { ArrowDownUp, ArrowRight, ArrowUpRight, Check, Clock3, Flower2, Heart, Plus, Search, ShieldCheck, Truck, X } from 'lucide-react';
import type { CartItem, Catalog, Product, Shop } from '../types';
import { haptic, money } from '../lib/api';

const people = [
  { id: 'ona', label: 'Onamga' }, { id: 'rafiqa', label: 'Rafiqamga' }, { id: 'qiz', label: 'Qizimga' },
  { id: 'dost', label: 'Do‘stimga' }, { id: 'hamkasb', label: 'Hamkasbimga' },
];
const ease = [0.22, 1, 0.36, 1] as const;
const nf = new Intl.NumberFormat('uz-UZ');
const stagger = { hide: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.28 } } };
const rise = { hide: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease } } };

type Props = {
  catalog: Catalog; favorites: string[]; cart: CartItem[]; shopFilter: string;
  setShopFilter: (id: string) => void; open: (product: Product) => void; add: (product: Product) => void;
  toggleFavorite: (id: string) => void; openShops: () => void;
};

function Photo({ product, className }: { product: Product; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [product.image]);
  if (failed) return <span className="gb-photo-fallback" role="img" aria-label="Rasm hozir ochilmadi"><Flower2 size={34} strokeWidth={1.2} /></span>;
  return <img className={className} src={product.image} alt={product.name} loading="lazy" onError={() => setFailed(true)} />;
}

function Favorite({ product, active, toggle }: { product: Product; active: boolean; toggle: () => void }) {
  return <button className={`gb-fav${active ? ' on' : ''}`} onClick={toggle} aria-label={`${product.name}: sevimlilar`} aria-pressed={active}>
    <motion.span animate={active ? { scale: [1, 1.45, 1] } : { scale: 1 }} transition={{ duration: 0.42, ease }}><Heart size={18} fill={active ? 'currentColor' : 'none'} /></motion.span>
  </button>;
}

function AddButton({ product, inCart, add, label }: { product: Product; inCart: boolean; add: () => void; label?: boolean }) {
  return <motion.button whileTap={{ scale: 0.94 }} className={`gb-add${inCart ? ' in' : ''}${label ? ' wide' : ''}`} disabled={!product.stock} onClick={add} aria-label={`${product.name}ni savatga qo‘shish`}>
    <span className="gb-add-icon"><AnimatePresence mode="popLayout" initial={false}>
      <motion.span key={inCart ? 'in' : 'out'} initial={{ scale: 0.3, opacity: 0, rotate: -60 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} exit={{ scale: 0.3, opacity: 0 }} transition={{ type: 'spring', stiffness: 620, damping: 26 }}>
        {inCart ? <Check size={20} strokeWidth={2.4} /> : <Plus size={20} strokeWidth={2.2} />}
      </motion.span>
    </AnimatePresence></span>
    {label && <span>{!product.stock ? 'Tugagan' : inCart ? 'Savatda' : 'Savatga qo‘shish'}</span>}
  </motion.button>;
}

function Budget({ lo, hi, step, value, onChange, prices, matched }: { lo: number; hi: number; step: number; value: number; onChange: (v: number) => void; prices: { id: string; price: number }[]; matched: number }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(value);
  const [intro, setIntro] = useState(true);
  useEffect(() => { const t = setTimeout(() => setIntro(false), 1800); return () => clearTimeout(t); }, []);
  useEffect(() => {
    if (reduce) { mv.set(value); return; }
    const controls = animate(mv, value, { duration: 0.28, ease });
    return () => controls.stop();
  }, [value, reduce, mv]);
  const text = useTransform(mv, v => nf.format(Math.round(v / 1000) * 1000));
  const ratio = (price: number) => hi === lo ? 1 : Math.min(1, Math.max(0, (price - lo) / (hi - lo)));
  const sorted = [...prices].sort((a, b) => a.price - b.price);
  return <motion.div className="gb-budget" variants={rise}>
    <div className="gb-budget-head">
      <label htmlFor="gb-cap">Byudjet</label>
      <p className="gb-cap-val"><motion.span>{text}</motion.span><small>so‘m gacha</small></p>
    </div>
    <div className="gb-track" style={{ '--r': ratio(value) } as CSSProperties}>
      <div className="gb-dots" aria-hidden="true">{sorted.map((p, i) => {
        const inside = p.price <= value;
        return <motion.span key={p.id} className={`gb-dot${inside ? ' in' : ''}`} style={{ '--p': ratio(p.price) } as CSSProperties}
          initial={{ scale: 0, y: 8 }} animate={{ scale: inside ? 1 : 0.55, y: 0 }}
          transition={{ type: 'spring', stiffness: 460, damping: 20, delay: intro ? 0.7 + i * 0.09 : 0 }} />;
      })}</div>
      <input id="gb-cap" type="range" min={lo} max={hi} step={step} value={value} disabled={hi === lo}
        onChange={e => onChange(Number(e.target.value))} onPointerDown={() => haptic()}
        aria-valuetext={`${nf.format(value)} so‘m gacha`} />
    </div>
    <div className="gb-scale" aria-hidden="true"><span>{nf.format(lo)}</span><span>{nf.format(hi)}</span></div>
    <p className="gb-fits" role="status" aria-live="polite">{matched ? <><b>{matched} ta</b> guldasta shu byudjetga sig‘adi</> : 'Bu byudjetga guldasta topilmadi'}</p>
  </motion.div>;
}

export function Home({ catalog, favorites, cart, shopFilter, setShopFilter, open, add, toggleFavorite, openShops }: Props) {
  const reduce = useReducedMotion();
  const { shops, products } = catalog;
  const [who, setWho] = useState('');
  const [cap, setCap] = useState<number | null>(null);
  const [sort, setSort] = useState<'fit' | 'low'>('fit');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [intro, setIntro] = useState(true);
  const results = useRef<HTMLElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  useEffect(() => { const t = setTimeout(() => setIntro(false), 1600); return () => clearTimeout(t); }, []);
  useEffect(() => { if (searching) searchInput.current?.focus(); }, [searching]);

  const shopOf = (p: Product) => shops.find(s => s.id === p.shopId);
  const all = products.map(p => p.price);
  const step = all.length && Math.max(...all) - Math.min(...all) > 1_000_000 ? 50_000 : 10_000;
  const lo = all.length ? Math.floor(Math.min(...all) / step) * step : 0;
  const hi = all.length ? Math.ceil(Math.max(...all) / step) * step : 0;
  const budget = Math.min(hi, Math.max(lo, cap ?? hi));
  const needle = query.trim().toLocaleLowerCase();
  const pool = products.filter(p => (!who || !p.audience?.length || p.audience.includes(who))
    && (shopFilter === 'all' || p.shopId === shopFilter)
    && (!needle || `${p.name} ${shopOf(p)?.name || ''}`.toLocaleLowerCase().includes(needle)));
  const fitting = pool.filter(p => p.price <= budget);
  const ordered = [...fitting].sort((a, b) => sort === 'fit' ? b.price - a.price : a.price - b.price).sort((a, b) => Number(!a.stock) - Number(!b.stock));
  const [lead, ...rest] = ordered;
  const nextUp = pool.filter(p => p.price > budget).sort((a, b) => a.price - b.price)[0];
  const filtered = !!who || cap !== null && budget < hi || shopFilter !== 'all' || !!needle;
  const reset = () => { setWho(''); setCap(null); setShopFilter('all'); setQuery(''); };
  const choose = (id: string) => { haptic(); setWho(w => w === id ? '' : id); };
  const shopName = shops.find(s => s.id === shopFilter)?.name;
  const slot = people.find(p => p.id === who)?.label || 'Kimga';
  const goResults = () => results.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  const inCart = (p: Product) => cart.some(i => i.productId === p.id);

  return <MotionConfig reducedMotion="user"><div className="gb-home"><div className="gb-main">
    <section className="gb-picker" aria-labelledby="gb-title">
      <motion.div className="gb-picker-in" variants={stagger} initial="hide" animate="show">
        <motion.p className="gb-eyebrow" variants={rise}>Urganch · {shops.length} ta do‘kon · {products.length} ta guldasta</motion.p>
        <h1 id="gb-title" className="gb-title">
          <span className="gb-mask"><motion.span className="gb-line" initial={{ y: '112%' }} animate={{ y: 0 }} transition={{ duration: 0.75, ease, delay: 0.05 }}>
            <span className="gb-slot"><AnimatePresence mode="popLayout" initial={false}>
              <motion.span key={slot} className={who ? 'picked' : undefined} initial={{ y: '90%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: '-90%', opacity: 0 }} transition={{ duration: 0.38, ease }}>{slot}</motion.span>
            </AnimatePresence></span>
          </motion.span></span>{' '}
          <span className="gb-mask"><motion.span className="gb-line" initial={{ y: '112%' }} animate={{ y: 0 }} transition={{ duration: 0.75, ease, delay: 0.15 }}>gul olasiz?</motion.span></span>
        </h1>
        <motion.div className="gb-people" role="group" aria-label="Gul kimga?" variants={stagger}>
          {people.map(p => <motion.button key={p.id} variants={rise} className={`gb-chip${who === p.id ? ' on' : ''}`} aria-pressed={who === p.id} onClick={() => choose(p.id)}>
            {who === p.id && <motion.span layoutId="gb-chip-bg" className="gb-chip-bg" transition={{ type: 'spring', stiffness: 520, damping: 38 }} />}
            <span>{p.label}</span>
          </motion.button>)}
        </motion.div>
        {products.length > 0 && <Budget lo={lo} hi={hi} step={step} value={budget} onChange={setCap} prices={pool.map(p => ({ id: p.id, price: p.price }))} matched={fitting.length} />}
      </motion.div>
    </section>

    <section className="gb-results" id="catalog" ref={results} aria-labelledby="gb-results-h">
      <div className="gb-results-head">
        <h2 id="gb-results-h">{shopName || 'Guldastalar'}</h2>
        <div className="gb-tools">
          {filtered && <button className="gb-tool" onClick={reset}><X size={15} /> Tozalash</button>}
          <button className="gb-tool" onClick={() => setSort(s => s === 'fit' ? 'low' : 'fit')} aria-label={`Tartib: ${sort === 'fit' ? 'byudjetga yaqin' : 'arzonroq birinchi'}. O‘zgartirish`}><ArrowDownUp size={15} />{sort === 'fit' ? 'Byudjetga yaqin' : 'Arzonroq birinchi'}</button>
          <button className="gb-tool icon" onClick={() => setSearching(s => !s)} aria-expanded={searching} aria-label="Gul yoki do‘kon qidirish"><Search size={17} /></button>
        </div>
      </div>
      <AnimatePresence initial={false}>{(searching || query) && <motion.div className="gb-search" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.28, ease }}>
        <label><Search size={17} /><input ref={searchInput} aria-label="Gul yoki do‘kon qidirish" placeholder="Gul yoki do‘kon nomi" value={query} onChange={e => setQuery(e.target.value)} />
          {query && <button aria-label="Qidiruvni tozalash" onClick={() => { setQuery(''); searchInput.current?.focus(); }}><X size={16} /></button>}</label>
      </motion.div>}</AnimatePresence>

      {products.length === 0 ? <div className="gb-empty"><Flower2 size={34} strokeWidth={1.3} /><h3>Hozircha gullar qo‘shilmagan</h3><p>Do‘konlar qo‘shgan gullar shu yerda ko‘rinadi.</p></div> : <>
        <AnimatePresence mode="wait" initial>{lead && <motion.article key={lead.id} className="gb-item gb-lead" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.4, ease, delay: intro ? 0.55 : 0 }}>
          <div className="gb-lead-photo">
            <button className="gb-photo" onClick={() => open(lead)} aria-label={`${lead.name} haqida`}><Photo product={lead} /></button>
            <Favorite product={lead} active={favorites.includes(lead.id)} toggle={() => toggleFavorite(lead.id)} />
          </div>
          <div className="gb-lead-body">
            <p className="gb-lead-label">{sort === 'fit' ? 'Byudjetingizga eng yaqin' : 'Eng arzon'}</p>
            <h3><button className="gb-name" onClick={() => open(lead)}>{lead.name}</button></h3>
            <p className="gb-shopline">{shopOf(lead)?.name}<span aria-hidden="true">·</span><Truck size={14} />{money(shopOf(lead)?.deliveryFee || 0)}<span aria-hidden="true">·</span><Clock3 size={14} />{shopOf(lead)?.deliveryTime}</p>
            <p className="gb-desc">{lead.description}</p>
            <div className="gb-buy"><strong className="gb-price">{money(lead.price)}</strong><AddButton product={lead} inCart={inCart(lead)} add={() => add(lead)} label /></div>
          </div>
        </motion.article>}</AnimatePresence>

        {rest.length > 0 && <p className="gb-more">Yana variantlar</p>}
        <ul className="gb-list">
          <AnimatePresence mode="popLayout" initial>{rest.map((p, i) => {
            const shop = shopOf(p);
            return <motion.li key={p.id} layout="position" className={`gb-item gb-row${p.stock ? '' : ' sold'}`}
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}
              transition={{ layout: { type: 'spring', stiffness: 420, damping: 40 }, duration: 0.34, ease, delay: intro ? 0.7 + i * 0.07 : 0 }}>
              <div className="gb-row-photo">
                <button className="gb-photo" onClick={() => open(p)} aria-label={`${p.name} haqida`}><Photo product={p} /></button>
                <Favorite product={p} active={favorites.includes(p.id)} toggle={() => toggleFavorite(p.id)} />
              </div>
              <div className="gb-row-body">
                <h3><button className="gb-name" onClick={() => open(p)}>{p.name}</button></h3>
                <p className="gb-shopline">{shop?.name}<span aria-hidden="true">·</span><Truck size={13} />{money(shop?.deliveryFee || 0)}</p>
                <div className="gb-buy"><strong className="gb-price">{money(p.price)}</strong><AddButton product={p} inCart={inCart(p)} add={() => add(p)} /></div>
              </div>
              {!p.stock && <span className="gb-sold">Vaqtincha tugagan</span>}
            </motion.li>;
          })}</AnimatePresence>
        </ul>

        {!lead && <motion.div className="gb-empty" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease }}>
          <Flower2 size={34} strokeWidth={1.3} />
          <h3>{nextUp ? 'Bu byudjetga guldasta topilmadi' : 'Mos guldasta topilmadi'}</h3>
          <p>{nextUp ? `Eng arzon mos gul — ${nextUp.name}, ${money(nextUp.price)}.` : 'Boshqa odam yoki do‘konni sinab ko‘ring.'}</p>
          {nextUp ? <button className="gb-cta" onClick={() => setCap(nextUp.price)}>Byudjetni {nf.format(nextUp.price)} so‘mgacha oshirish <ArrowRight size={18} /></button>
            : <button className="gb-cta" onClick={reset}>Hammasini ko‘rsatish <ArrowRight size={18} /></button>}
        </motion.div>}
      </>}
    </section>

    {shops.length > 0 && <section className="gb-shops" aria-labelledby="gb-shops-h">
      <div className="gb-sec-head"><h2 id="gb-shops-h">Urganch do‘konlari</h2><button className="gb-tool" onClick={openShops}>Barchasi <ArrowRight size={15} /></button></div>
      <motion.ul variants={{ hide: {}, show: { transition: { staggerChildren: 0.09 } } }} initial="hide" whileInView="show" viewport={{ once: true, amount: 0.25 }}>
        {shops.map((shop: Shop) => {
          const on = shopFilter === shop.id;
          return <motion.li key={shop.id} variants={rise}>
            <button className={`gb-shop${on ? ' on' : ''}`} aria-pressed={on} onClick={() => { setShopFilter(on ? 'all' : shop.id); goResults(); }}>
              <span className="gb-shop-name">{shop.name}</span>
              <span className="gb-shop-sub">{shop.subtitle}</span>
              <span className="gb-shop-meta"><Truck size={14} />{money(shop.deliveryFee)}<i aria-hidden="true" /><Clock3 size={14} />{shop.deliveryTime}</span>
              <span className="gb-shop-count">{products.filter(p => p.shopId === shop.id).length} ta gul<ArrowUpRight size={18} /></span>
            </button>
          </motion.li>;
        })}
      </motion.ul>
    </section>}
    </div>

    <motion.ul className="gb-promise" initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.4 }} transition={{ duration: 0.5, ease }}>
      <li><Truck size={20} /><span><strong>Yetkazish haqi oldindan ko‘rinadi</strong>Savatda yashirin to‘lov yo‘q</span></li>
      <li><Flower2 size={20} /><span><strong>Buyurtma bitta do‘konga boradi</strong>Do‘kon o‘zi tayyorlaydi va yetkazadi</span></li>
      <li><ShieldCheck size={20} /><span><strong>To‘lov — yetkazilganda</strong>Do‘kon tasdiqlaganidan keyin</span></li>
    </motion.ul>
  </div></MotionConfig>;
}
