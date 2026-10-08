import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { AnimatePresence, MotionConfig, animate, motion, useInView, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform, useVelocity } from 'motion/react';
import { ArrowRight, ArrowUpRight, Check, Clock3, Flower2, Heart, Plus, Search, ShieldCheck, Tag, Truck, X } from 'lucide-react';
import type { CartItem, Catalog, Product, Shop } from '../types';
import { haptic, money } from '../lib/api';
import { Dialog } from './Dialog';
import { sampleTint, type Tint } from '../lib/tint';

const people = [
  { id: '', label: 'Hammasi' }, { id: 'ona', label: 'Onamga' }, { id: 'rafiqa', label: 'Rafiqamga' },
  { id: 'qiz', label: 'Qizimga' }, { id: 'dost', label: 'Do‘stimga' }, { id: 'hamkasb', label: 'Hamkasbimga' },
];
const ease = [0.22, 1, 0.36, 1] as const;
const nf = new Intl.NumberFormat('uz-UZ');

type Props = {
  catalog: Catalog; favorites: string[]; cart: CartItem[]; shopFilter: string;
  setShopFilter: (id: string) => void; open: (product: Product) => void; add: (product: Product) => void;
  toggleFavorite: (id: string) => void; openShops: () => void;
};

/** Paper price tag on a string. It swings slowly when it scrolls into view, when touched and when the bouquet is added,
 *  and leans a little with the scroll speed, like something really hanging there. */
function HangTag({ price, kick }: { price: number; kick: number }) {
  const reduce = useReducedMotion();
  const impulse = useMotionValue(0);
  const velocity = useVelocity(useScroll().scrollY);
  const lean = useSpring(useTransform(velocity, [-2600, 0, 2600], [4.5, 0, -4.5], { clamp: true }), { stiffness: 34, damping: 15, mass: 1.3 });
  const rotate = useTransform([impulse, lean], ([a, b]) => (a as number) + (b as number));
  const ref = useRef<HTMLDivElement>(null);
  const run = useRef<ReturnType<typeof animate> | null>(null);
  const seen = useInView(ref, { once: true, amount: 0.6 });
  const swing = (amplitude: number) => {
    if (reduce) return;
    run.current?.stop(); impulse.set(amplitude);
    run.current = animate(impulse, 0, { type: 'spring', stiffness: 13, damping: 3.2, mass: 1.5 });
  };
  useEffect(() => { if (seen) swing(9); }, [seen]);
  useEffect(() => { if (kick) swing(8); }, [kick]);
  useEffect(() => () => run.current?.stop(), []);
  return <motion.div ref={ref} className="gf-hang" style={reduce ? undefined : { rotate, originX: 0.5, originY: 0 }}
    onPointerEnter={() => { if (Math.abs(impulse.get()) < 0.8) swing(5); }} onPointerDown={() => swing(9)}>
    <span className="gf-nail" aria-hidden="true" />
    <span className="gf-string" aria-hidden="true" />
    <div className="gf-tag"><small>Narxi</small><strong>{nf.format(price)}</strong><small>so‘m</small></div>
  </motion.div>;
}

function Card({ product, shop, tint, favorite, inCart, open, add, toggleFavorite }: { product: Product; shop?: Shop; tint?: Tint; favorite: boolean; inCart: boolean; open: () => void; add: () => void; toggleFavorite: () => void }) {
  const reduce = useReducedMotion();
  const figure = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: figure, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], reduce ? ['0%', '0%'] : ['-5%', '5%']);
  const [kick, setKick] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [product.image]);
  const style = tint ? { '--th': tint.h, '--ts': tint.s } as CSSProperties : undefined;
  return <motion.article layout="position" id={`gf-${product.id}`} data-id={product.id} className={`gf-card${product.stock ? '' : ' sold'}`} style={style}
    initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.12 }} exit={{ opacity: 0, scale: 0.97 }}
    transition={{ duration: 0.6, ease, layout: { type: 'spring', stiffness: 380, damping: 40 } }}>
    <div className="gf-figure" ref={figure}>
      <motion.span className="gf-mat" aria-hidden="true" initial={{ opacity: 0, x: -18, y: -18 }} whileInView={{ opacity: 1, x: 0, y: 0 }}
        viewport={{ once: true, amount: 0.2 }} transition={{ duration: 0.9, ease, delay: 0.3 }} />
      <motion.div className="gf-photo" initial={{ clipPath: 'inset(9% 7% 9% 7% round 12px)' }} whileInView={{ clipPath: 'inset(0% 0% 0% 0% round 12px)' }}
        viewport={{ once: true, amount: 0.2 }} transition={{ duration: 1, ease }}>
        <button className="gf-photo-btn" onClick={open} aria-label={`${product.name} haqida`}>
          {failed ? <span className="gf-fallback" role="img" aria-label="Rasm hozir ochilmadi"><Flower2 size={44} strokeWidth={1.1} /></span>
            : <motion.img style={{ y, scale: 1.12 }} src={product.image} alt={product.name} loading="lazy" onError={() => setFailed(true)} />}
        </button>
        {!product.stock && <span className="gf-sold">Vaqtincha tugagan</span>}
      </motion.div>
      <button className={`gf-fav${favorite ? ' on' : ''}`} onClick={toggleFavorite} aria-label={`${product.name}: sevimlilar`} aria-pressed={favorite}>
        <motion.span animate={favorite ? { scale: [1, 1.45, 1] } : { scale: 1 }} transition={{ duration: 0.5, ease }}><Heart size={18} fill={favorite ? 'currentColor' : 'none'} /></motion.span>
      </button>
      <HangTag price={product.price} kick={kick} />
    </div>
    <div className="gf-info">
      <p className="gf-shopline"><span>{shop?.name}</span><i aria-hidden="true" /><span className="gf-nw"><Truck size={14} />{money(shop?.deliveryFee || 0)}</span><i aria-hidden="true" /><span className="gf-nw"><Clock3 size={14} />{shop?.deliveryTime}</span></p>
      <h3><button className="gf-name" onClick={open}><span className="gf-mask"><motion.span initial={{ y: '112%' }} whileInView={{ y: 0 }} viewport={{ once: true, amount: 0.8 }} transition={{ duration: 0.8, ease, delay: 0.15 }}>{product.name}</motion.span></span></button></h3>
      <p className="gf-desc">{product.description}</p>
      <motion.button whileTap={{ scale: 0.98 }} className={`gf-add${inCart ? ' in' : ''}`} disabled={!product.stock} aria-label={`${product.name}ni savatga qo‘shish`}
        onClick={() => { add(); if (product.stock) setKick(k => k + 1); }}>
        <span className="gf-add-main">
          <span className="gf-add-icon"><AnimatePresence mode="popLayout" initial={false}>
            <motion.span key={inCart ? 'in' : 'out'} initial={{ scale: 0.3, opacity: 0, rotate: -60 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} exit={{ scale: 0.3, opacity: 0 }} transition={{ type: 'spring', stiffness: 520, damping: 28 }}>
              {inCart ? <Check size={20} strokeWidth={2.4} /> : <Plus size={20} strokeWidth={2.2} />}
            </motion.span>
          </AnimatePresence></span>
          <span>{!product.stock ? 'Vaqtincha tugagan' : inCart ? 'Savatda' : 'Savatga qo‘shish'}</span>
        </span>
        {product.stock > 0 && <span className="gf-add-price">{money(product.price)}</span>}
      </motion.button>
    </div>
  </motion.article>;
}

function Pill({ product }: { product?: Product }) {
  return <span className="gf-pill" aria-hidden="true"><AnimatePresence mode="popLayout" initial={false}>
    {product && <motion.img key={product.id} src={product.image} alt="" initial={{ opacity: 0, scale: 1.3 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.8, ease }} />}
  </AnimatePresence></span>;
}

export function HomeFeed({ catalog, favorites, cart, shopFilter, setShopFilter, open, add, toggleFavorite, openShops }: Props) {
  const reduce = useReducedMotion();
  const { shops, products } = catalog;
  const [who, setWho] = useState('');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [prices, setPrices] = useState(false);
  const [active, setActive] = useState('');
  const [tints, setTints] = useState<Record<string, Tint>>({});
  const root = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const feed = useRef<HTMLElement>(null);
  useEffect(() => { if (searching) searchInput.current?.focus(); }, [searching]);

  const shopOf = (p: Product) => shops.find(s => s.id === p.shopId);
  const needle = query.trim().toLocaleLowerCase();
  const list = products.filter(p => (!who || !p.audience?.length || p.audience.includes(who))
    && (shopFilter === 'all' || p.shopId === shopFilter)
    && (!needle || `${p.name} ${shopOf(p)?.name || ''}`.toLocaleLowerCase().includes(needle)));
  const filtered = !!who || shopFilter !== 'all' || !!needle;
  const reset = () => { setWho(''); setShopFilter('all'); setQuery(''); };
  const inCart = (p: Product) => cart.some(i => i.productId === p.id);
  const ids = list.map(p => p.id).join();
  const images = products.map(p => p.image).join();

  // photo colours -> a mat behind every photo, and a soft wash on the page that follows the bouquet in the middle of the screen
  useEffect(() => {
    let live = true;
    products.forEach(p => sampleTint(p.image).then(t => { if (live && t) setTints(m => m[p.id]?.h === t.h ? m : { ...m, [p.id]: t }); }));
    return () => { live = false; };
  }, [images]);
  useEffect(() => {
    const shell = root.current?.closest<HTMLElement>('.home-view');
    const t = tints[active];
    if (!shell || !t) { shell?.style.removeProperty('--bg'); return; }
    const dark = document.documentElement.dataset.theme === 'dark';
    shell.style.setProperty('--bg', dark ? `hsl(${t.h} ${Math.round(t.s * .4)}% 9%)` : `hsl(${t.h} ${Math.round(t.s * .75)}% 96%)`);
  }, [active, tints]);
  useEffect(() => () => { root.current?.closest<HTMLElement>('.home-view')?.style.removeProperty('--bg'); }, []);

  useEffect(() => {
    // the card whose centre is closest to the middle of the screen is the "current" one (two columns can be visible at once)
    let frame = 0;
    const measure = () => {
      frame = 0;
      const mid = innerHeight / 2;
      let best = '', gap = Infinity;
      document.querySelectorAll<HTMLElement>('.gf-card').forEach(card => {
        const r = card.getBoundingClientRect();
        if (r.bottom < 0 || r.top > innerHeight) return;
        const d = Math.abs((r.top + r.bottom) / 2 - mid);
        if (d < gap) { gap = d; best = card.dataset.id || ''; }
      });
      setActive(best);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    schedule();
    addEventListener('scroll', schedule, { passive: true }); addEventListener('resize', schedule);
    return () => { removeEventListener('scroll', schedule); removeEventListener('resize', schedule); cancelAnimationFrame(frame); };
  }, [ids]);

  const jump = (id: string) => {
    setPrices(false);
    setTimeout(() => document.getElementById(`gf-${id}`)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' }), 60);
  };
  const goFeed = () => feed.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });

  return <MotionConfig reducedMotion="user"><div className="gf-home" ref={root}><div className="gf-main">
    <aside className="gf-side">
      <div className="gf-intro">
        <motion.p className="gf-eyebrow" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease, delay: 0.1 }}>{products.length} ta guldasta · {shops.length} ta do‘kon</motion.p>
        <h1 className="gf-title" id="gf-title">
          <span className="gf-mask"><motion.span initial={{ y: '112%' }} animate={{ y: 0 }} transition={{ duration: 0.9, ease, delay: 0.05 }}>Urganch<Pill product={list[0] || products[0]} /></motion.span></span>{' '}
          <span className="gf-mask"><motion.span initial={{ y: '112%' }} animate={{ y: 0 }} transition={{ duration: 0.9, ease, delay: 0.18 }}>guldastalari</motion.span></span>
        </h1>
        <motion.p className="gf-lede" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease, delay: 0.45 }}>Narxi yorliqda, yetkazish haqi esa guldasta tagida ko‘rinadi.</motion.p>
      </div>
      <div className="gf-bar">
        <div className="gf-bar-row">
          <motion.div className="gf-chips" role="group" aria-label="Gul kimga?" initial="hide" animate="show" variants={{ hide: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.5 } } }}>
            {people.map(p => <motion.button key={p.id || 'all'} variants={{ hide: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease } } }}
              className={`gf-chip${who === p.id ? ' on' : ''}`} aria-pressed={who === p.id} onClick={() => { haptic(); setWho(p.id); }}>
              {who === p.id && <motion.span layoutId="gf-chip-bg" className="gf-chip-bg" transition={{ type: 'spring', stiffness: 420, damping: 38 }} />}
              <span>{p.label}</span>
            </motion.button>)}
          </motion.div>
          <div className="gf-tools">
            {filtered && <button className="gf-tool" onClick={reset} aria-label="Filtrlarni tozalash"><X size={18} /><span className="lbl">Tozalash</span></button>}
            <button className="gf-tool" onClick={() => setSearching(s => !s)} aria-expanded={searching} aria-label="Gul yoki do‘kon qidirish"><Search size={18} /><span className="lbl">Qidirish</span></button>
            <button className="gf-tool prices" onClick={() => setPrices(true)} aria-label="Narxlar ro‘yxati"><Tag size={18} /><span className="lbl">Narxlar ro‘yxati</span></button>
          </div>
        </div>
        <AnimatePresence initial={false}>{(searching || query) && <motion.div className="gf-search" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease }}>
          <label><Search size={17} /><input ref={searchInput} aria-label="Gul yoki do‘kon qidirish" placeholder="Gul yoki do‘kon nomi" value={query} onChange={e => setQuery(e.target.value)} />
            {query && <button aria-label="Qidiruvni tozalash" onClick={() => { setQuery(''); searchInput.current?.focus(); }}><X size={16} /></button>}</label>
        </motion.div>}</AnimatePresence>
      </div>
      {list.length > 0 && <nav className="gf-index-wrap" aria-label="Narxlar ro‘yxati">
        <h2 className="gf-index-h">Narxlar</h2>
        <ol className="gf-index">{list.map(p => <li key={p.id}><button className={`gf-ix${active === p.id ? ' on' : ''}`} onClick={() => jump(p.id)}>
          {active === p.id && <motion.span layoutId="gf-ix-mark" className="gf-ix-mark" transition={{ type: 'spring', stiffness: 420, damping: 38 }} />}
          <span className="gf-ix-name">{p.name}</span><i className="gf-ix-dots" aria-hidden="true" /><span className="gf-ix-price">{nf.format(p.price)}</span>
        </button></li>)}</ol>
      </nav>}
    </aside>

    <section className="gf-feed" id="catalog" ref={feed} aria-label="Guldastalar">
      {products.length === 0 ? <div className="gf-empty"><Flower2 size={36} strokeWidth={1.2} /><h3>Hozircha gullar qo‘shilmagan</h3><p>Do‘konlar qo‘shgan gullar shu yerda ko‘rinadi.</p></div>
        : <AnimatePresence mode="popLayout" initial={false}>{list.map(p => <Card key={p.id} product={p} shop={shopOf(p)} tint={tints[p.id]} favorite={favorites.includes(p.id)} inCart={inCart(p)}
          open={() => open(p)} add={() => add(p)} toggleFavorite={() => toggleFavorite(p.id)} />)}</AnimatePresence>}
      {products.length > 0 && !list.length && <div className="gf-empty"><Flower2 size={36} strokeWidth={1.2} /><h3>Mos guldasta topilmadi</h3><p>Boshqa odam yoki do‘konni tanlab ko‘ring.</p><button className="gf-cta" onClick={reset}>Hammasini ko‘rsatish <ArrowRight size={18} /></button></div>}
    </section>
  </div>

  {shops.length > 0 && <section className="gf-shops" aria-labelledby="gf-shops-h">
    <div className="gf-sec-head"><h2 id="gf-shops-h">Urganch do‘konlari</h2><button className="gf-link" onClick={openShops}>Barchasi <ArrowRight size={15} /></button></div>
    <motion.ul variants={{ hide: {}, show: { transition: { staggerChildren: 0.09 } } }} initial="hide" whileInView="show" viewport={{ once: true, amount: 0.25 }}>
      {shops.map(shop => {
        const on = shopFilter === shop.id;
        return <motion.li key={shop.id} variants={{ hide: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease } } }}>
          <button className={`gf-shop${on ? ' on' : ''}`} aria-pressed={on} onClick={() => { setShopFilter(on ? 'all' : shop.id); goFeed(); }}>
            <span className="gf-shop-name">{shop.name}</span>
            <span className="gf-shop-sub">{shop.subtitle}</span>
            <span className="gf-shop-meta"><Truck size={14} />{money(shop.deliveryFee)}<i aria-hidden="true" /><Clock3 size={14} />{shop.deliveryTime}</span>
            <span className="gf-shop-count">{products.filter(p => p.shopId === shop.id).length} ta gul<ArrowUpRight size={18} /></span>
          </button>
        </motion.li>;
      })}
    </motion.ul>
  </section>}

  <motion.ul className="gf-promise" initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.4 }} transition={{ duration: 0.6, ease }}>
    <li><Truck size={20} /><span><strong>Yetkazish haqi oldindan ko‘rinadi</strong>Savatda yashirin to‘lov yo‘q</span></li>
    <li><Flower2 size={20} /><span><strong>Buyurtma bitta do‘konga boradi</strong>Do‘kon o‘zi tayyorlaydi va yetkazadi</span></li>
    <li><ShieldCheck size={20} /><span><strong>To‘lov — yetkazilganda</strong>Do‘kon tasdiqlaganidan keyin</span></li>
  </motion.ul>

  {prices && <Dialog title="Narxlar ro‘yxati" onClose={() => setPrices(false)}>
    {list.length ? <ol className="gf-sheet">{list.map(p => <li key={p.id}><button onClick={() => jump(p.id)}>
      <img src={p.image} alt="" loading="lazy" /><span className="gf-sheet-name">{p.name}<small>{shopOf(p)?.name}</small></span><span className="gf-sheet-price">{nf.format(p.price)} <small>so‘m</small></span>
    </button></li>)}</ol> : <p className="gf-sheet-empty">Mos guldasta yo‘q.</p>}
  </Dialog>}
  </div></MotionConfig>;
}
