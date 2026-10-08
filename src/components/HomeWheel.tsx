import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { AnimatePresence, MotionConfig, animate, motion, useMotionValue, useMotionValueEvent, useReducedMotion, useTransform, type MotionValue } from 'motion/react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, Clock3, Flower2, Heart, LayoutGrid, Plus, ShieldCheck, Truck, X } from 'lucide-react';
import type { CartItem, Catalog, Product } from '../types';
import { haptic, money } from '../lib/api';
import { Dialog } from './Dialog';
import { sampleTint, type Tint } from '../lib/tint';

const people = [
  { id: '', label: 'Hammasi' }, { id: 'ona', label: 'Onamga' }, { id: 'rafiqa', label: 'Rafiqamga' },
  { id: 'qiz', label: 'Qizimga' }, { id: 'dost', label: 'Do‘stimga' }, { id: 'hamkasb', label: 'Hamkasbimga' },
];
const ease = [0.22, 1, 0.36, 1] as const;
const nf = new Intl.NumberFormat('uz-UZ');
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const spring = { type: 'spring', stiffness: 150, damping: 23 } as const;
const ANGLE = 0.5;

type Props = {
  catalog: Catalog; favorites: string[]; cart: CartItem[]; shopFilter: string;
  setShopFilter: (id: string) => void; open: (product: Product) => void; add: (product: Product) => void;
  toggleFavorite: (id: string) => void; openShops: () => void;
};
type Flight = { id: number; src: string; x0: number; y0: number; size: number; x1: number; y1: number };

/** Price digits roll like an odometer. Columns are keyed from the right so they survive a change of length. */
function Odometer({ value, reduce }: { value: number; reduce: boolean }) {
  const text = nf.format(value), chars = [...text];
  return <span className="gw-odo" role="img" aria-label={`${text} so‘m`}>{chars.map((ch, i) => /\d/.test(ch)
    ? <span className="gw-digit" key={`d${chars.length - i}`} aria-hidden="true">
      <motion.span className="gw-strip" initial={{ y: '0%' }} animate={{ y: `${-Number(ch) * 10}%` }} transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 130, damping: 20, delay: (chars.length - i) * 0.02 }}>
        {Array.from({ length: 10 }, (_, n) => <span key={n}>{n}</span>)}
      </motion.span></span>
    : <span className="gw-sep" key={`s${chars.length - i}`} aria-hidden="true">{' '}</span>)}</span>;
}

/** One circular bouquet on the wheel. Every transform is derived from the shared fractional position. */
function Disc({ product, index, pos, gR, gD, ready, current, onPick }: { product: Product; index: number; pos: MotionValue<number>; gR: MotionValue<number>; gD: MotionValue<number>; ready: MotionValue<number>; current: boolean; onPick: () => void }) {
  const mvs = [pos, gR, gD, ready] as MotionValue<number>[];
  const arc = (p: number) => clamp((index - p) * ANGLE, -2.2, 2.2);
  const intro = (p: number, t: number) => clamp(t * 1.6 - Math.abs(index - p) * 0.22, 0, 1);
  const tf = (fn: (p: number, r: number, t: number) => number) => useTransform(mvs, v => { const [p, r, , t] = v as number[]; return fn(p, r, t); });
  const x = tf((p, r) => Math.sin(arc(p)) * r);
  const y = tf((p, r, t) => (1 - Math.cos(arc(p))) * r * 0.6 + (1 - intro(p, t)) * 140);
  const scale = tf((p, _r, t) => Math.max(0.15, 1 - Math.abs(index - p) * 0.27) * (0.4 + 0.6 * intro(p, t)));
  const rotate = tf((p, _r, t) => (index - p) * 22 - (1 - intro(p, t)) * 80);
  const opacity = tf((p, _r, t) => clamp(1.18 - Math.abs(index - p) * 0.36, 0, 1) * intro(p, t));
  const zIndex = tf(p => 100 - Math.round(Math.abs(index - p) * 10));
  const size = useTransform(gD, d => d);
  const half = useTransform(gD, d => -d / 2);
  return <motion.button className={`gw-disc${current ? ' current' : ''}`} onClick={onPick} tabIndex={current ? 0 : -1}
    aria-label={current ? `${product.name} haqida` : `${product.name}ni tanlash`}
    style={{ x, y, scale, rotate, opacity, zIndex, width: size, height: size, marginLeft: half, marginTop: half }}>
    <img src={product.image} alt="" draggable={false} loading={Math.abs(index) < 4 ? 'eager' : 'lazy'} />
  </motion.button>;
}

export function HomeWheel({ catalog, favorites, cart, shopFilter, setShopFilter, open, add, toggleFavorite, openShops }: Props) {
  const reduce = useReducedMotion() ?? false;
  const { shops, products } = catalog;
  const [who, setWho] = useState('');
  const [idx, setIdx] = useState(0);
  const [grid, setGrid] = useState(false);
  const [tints, setTints] = useState<Record<string, Tint>>({});
  const [flights, setFlights] = useState<Flight[]>([]);
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const discRef = useRef<HTMLDivElement>(null);
  const shopsRef = useRef<HTMLElement>(null);
  const pos = useMotionValue(0), ready = useMotionValue(reduce ? 1 : 0);
  const gR = useMotionValue(420), gD = useMotionValue(260);
  const [dia, setDia] = useState(260);
  const prev = useRef(0);
  const run = useRef<ReturnType<typeof animate> | null>(null);
  const flightId = useRef(0);

  const shopOf = (p: Product) => shops.find(s => s.id === p.shopId);
  const list = products.filter(p => (!who || !p.audience?.length || p.audience.includes(who)) && (shopFilter === 'all' || p.shopId === shopFilter));
  const n = list.length;
  const ids = list.map(p => p.id).join();
  const current = list[clamp(idx, 0, Math.max(0, n - 1))];
  const dir = idx >= prev.current ? 1 : -1;
  useEffect(() => { prev.current = idx; });

  // geometry follows the stage size
  useEffect(() => {
    const el = stage.current; if (!el) return;
    const fit = () => {
      const w = el.clientWidth, h = el.clientHeight;
      const d = Math.round(clamp(Math.min(w * 0.7, h * 0.86), 180, 470));
      gD.set(d); gR.set(d * 1.63); setDia(d);
    };
    fit();
    const ro = new ResizeObserver(fit); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { if (reduce) { ready.set(1); return; } const c = animate(ready, 1, { duration: 1.5, ease, delay: 0.25 }); return () => c.stop(); }, [reduce]);
  useMotionValueEvent(pos, 'change', v => { const r = clamp(Math.round(v), 0, Math.max(0, n - 1)); setIdx(i => i === r ? i : r); });

  const goTo = (i: number) => {
    const target = clamp(i, 0, Math.max(0, n - 1));
    run.current?.stop();
    run.current = animate(pos, target, reduce ? { duration: 0 } : spring);
    haptic();
  };
  // filter changed: start again from the first bouquet
  useEffect(() => { run.current?.stop(); pos.set(0); setIdx(0); }, [ids]);

  // photo colours -> the whole page takes the colour of the bouquet in front
  useEffect(() => {
    let live = true;
    products.forEach(p => sampleTint(p.image).then(t => { if (live && t) setTints(m => m[p.id]?.h === t.h ? m : { ...m, [p.id]: t }); }));
    return () => { live = false; };
  }, [products.map(p => p.image).join()]);
  const tint = current ? tints[current.id] : undefined;
  useEffect(() => {
    const shell = root.current?.closest<HTMLElement>('.home-view');
    if (!shell || !tint) { shell?.style.removeProperty('--bg'); return; }
    const dark = document.documentElement.dataset.theme === 'dark';
    shell.style.setProperty('--bg', dark ? `hsl(${tint.h} ${Math.round(tint.s * .45)}% 11%)` : `hsl(${tint.h} ${Math.round(tint.s * .85)}% 90%)`);
  }, [tint?.h, tint?.s]);
  useEffect(() => () => { root.current?.closest<HTMLElement>('.home-view')?.style.removeProperty('--bg'); }, []);

  // drag / swipe / trackpad / keyboard
  const start = useRef(0), wheelLock = useRef(0), wheelSum = useRef(0);
  const step = () => gD.get() * 0.78;
  const band = (p: number) => p < 0 ? p * 0.35 : p > n - 1 ? n - 1 + (p - (n - 1)) * 0.35 : p;
  const onPanStart = () => { run.current?.stop(); start.current = pos.get(); };
  const onPan = (_: unknown, info: { offset: { x: number } }) => pos.set(band(start.current - info.offset.x / step()));
  const onPanEnd = (_: unknown, info: { velocity: { x: number } }) => goTo(Math.round(clamp(pos.get() - info.velocity.x / step() * 0.22, 0, n - 1)));
  const onWheel = (e: React.WheelEvent) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    wheelSum.current += e.deltaX;
    if (Math.abs(wheelSum.current) > 70 && performance.now() - wheelLock.current > 380) { goTo(idx + Math.sign(wheelSum.current)); wheelLock.current = performance.now(); wheelSum.current = 0; }
  };
  const onKey = (e: React.KeyboardEvent) => { if (e.key === 'ArrowRight') { e.preventDefault(); goTo(idx + 1); } if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(idx - 1); } };

  const inCart = (p: Product) => cart.some(i => i.productId === p.id);
  const addWithFlight = (p: Product) => {
    add(p);
    const from = discRef.current?.getBoundingClientRect(), to = document.querySelector('.bag-button')?.getBoundingClientRect();
    if (reduce || !p.stock || !from || !to) return;
    const size = Math.min(from.width, from.height) * 0.6;
    setFlights(f => [...f, { id: ++flightId.current, src: p.image, size, x0: from.left + from.width / 2 - size / 2, y0: from.top + from.height / 2 - size / 2, x1: to.left + to.width / 2 - 14, y1: to.top + to.height / 2 - 14 }]);
  };
  const reset = () => { setWho(''); setShopFilter('all'); };
  const style = tint ? { '--th': tint.h, '--ts': tint.s } as CSSProperties : undefined;
  const label = current ? String(idx + 1).padStart(2, '0') : '00';

  return <MotionConfig reducedMotion="user"><div className="gw-home" ref={root} style={style}>
    <section className="gw-screen" aria-label="Guldastalar">
      <div className="gw-top">
        <div className="gw-chips" role="group" aria-label="Gul kimga?">
          {people.map(p => <button key={p.id || 'all'} className={`gw-chip${who === p.id ? ' on' : ''}`} aria-pressed={who === p.id} onClick={() => { haptic(); setWho(p.id); }}>
            {who === p.id && <motion.span layoutId="gw-chip-bg" className="gw-chip-bg" transition={{ type: 'spring', stiffness: 420, damping: 38 }} />}
            <span>{p.label}</span>
          </button>)}
        </div>
        <button className="gw-icon" onClick={() => setGrid(true)} aria-label="Hamma guldastalar ro‘yxati"><LayoutGrid size={20} /></button>
      </div>

      {shopFilter !== 'all' && <button className="gw-shop-chip" onClick={() => setShopFilter('all')}>{shops.find(s => s.id === shopFilter)?.name}<X size={14} /> Hamma do‘konlar</button>}

      <div className="gw-meta">
        <h1 className="gw-h1">Urganch guldastalari</h1>
        <div className="gw-pager">
          <button className="gw-icon" onClick={() => goTo(idx - 1)} disabled={idx <= 0} aria-label="Oldingi guldasta"><ArrowLeft size={20} /></button>
          <span className="gw-count" aria-hidden="true"><b>{label}</b> / {String(n).padStart(2, '0')}</span>
          <button className="gw-icon" onClick={() => goTo(idx + 1)} disabled={idx >= n - 1} aria-label="Keyingi guldasta"><ArrowRight size={20} /></button>
        </div>
      </div>

      {n === 0 ? <div className="gw-empty"><Flower2 size={38} strokeWidth={1.2} /><h2>{products.length ? 'Mos guldasta topilmadi' : 'Hozircha gullar qo‘shilmagan'}</h2>
        {products.length > 0 && <button className="gw-cta" onClick={reset}>Hammasini ko‘rsatish <ArrowRight size={18} /></button>}</div> : <>
        <div className="gw-stage" ref={stage} tabIndex={0} role="group" aria-roledescription="g‘ildirak" aria-label="Guldastalar g‘ildiragi. Chapga yoki o‘ngga suring"
          onKeyDown={onKey} onWheel={onWheel}>
          <AnimatePresence mode="popLayout" initial={false} custom={dir}>
            <motion.div key={current.id} className="gw-word" aria-hidden="true" custom={dir}
              style={{ fontSize: `min(34vw, ${262 / Math.max(6, current.name.length)}vw, 380px)` }}
              variants={{ enter: (d: number) => ({ x: d * 90, opacity: 0 }), center: { x: 0, opacity: 1 }, exit: (d: number) => ({ x: -d * 90, opacity: 0 }) }}
              initial="enter" animate="center" exit="exit" transition={{ duration: 0.7, ease }}>{current.name}</motion.div>
          </AnimatePresence>
          <Ring pos={pos} dia={dia} reduce={reduce} />
          <motion.div className="gw-pan" onPanStart={onPanStart} onPan={onPan} onPanEnd={onPanEnd}>
            <div className="gw-track" ref={discRef} style={{ width: dia, height: dia }} aria-hidden="true" />
            {list.map((p, i) => Math.abs(i - idx) <= 3 ? <Disc key={p.id} product={p} index={i} pos={pos} gR={gR} gD={gD} ready={ready} current={i === idx}
              onPick={() => (i === idx ? open(p) : goTo(i))} /> : null)}
          </motion.div>
        </div>

        <div className="gw-info" aria-live="polite">
          <AnimatePresence mode="wait" initial={false} custom={dir}>
            <motion.div key={current.id} className="gw-info-in" custom={dir}
              variants={{ enter: (d: number) => ({ opacity: 0, y: 18 * d }), center: { opacity: 1, y: 0 }, exit: (d: number) => ({ opacity: 0, y: -14 * d }) }}
              initial="enter" animate="center" exit="exit" transition={{ duration: 0.28, ease }}>
              <p className="gw-shopline"><span>{shopOf(current)?.name}</span><i aria-hidden="true" /><span className="gw-nw"><Truck size={14} />{money(shopOf(current)?.deliveryFee || 0)}</span><i aria-hidden="true" /><span className="gw-nw"><Clock3 size={14} />{shopOf(current)?.deliveryTime}</span></p>
              <div className="gw-name-row">
                <h2 className="gw-name"><button onClick={() => open(current)}>{current.name}</button></h2>
                <button className={`gw-fav${favorites.includes(current.id) ? ' on' : ''}`} onClick={() => toggleFavorite(current.id)} aria-label={`${current.name}: sevimlilar`} aria-pressed={favorites.includes(current.id)}>
                  <motion.span animate={favorites.includes(current.id) ? { scale: [1, 1.45, 1] } : { scale: 1 }} transition={{ duration: 0.5, ease }}><Heart size={22} fill={favorites.includes(current.id) ? 'currentColor' : 'none'} /></motion.span>
                </button>
              </div>
            </motion.div>
          </AnimatePresence>
          <div className="gw-buy">
            <div className="gw-price"><Odometer value={current.price} reduce={reduce} /><small>so‘m</small></div>
            <motion.button whileTap={{ scale: 0.9 }} className={`gw-add${inCart(current) ? ' in' : ''}`} disabled={!current.stock} onClick={() => addWithFlight(current)} aria-label={`${current.name}ni savatga qo‘shish`}>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span key={inCart(current) ? 'in' : 'out'} initial={{ scale: 0.3, opacity: 0, rotate: -90 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} exit={{ scale: 0.3, opacity: 0 }} transition={{ type: 'spring', stiffness: 520, damping: 26 }}>
                  {inCart(current) ? <Check size={28} strokeWidth={2.4} /> : <Plus size={28} strokeWidth={2.2} />}
                </motion.span>
              </AnimatePresence>
            </motion.button>
          </div>
          {!current.stock && <p className="gw-sold">Vaqtincha tugagan</p>}
        </div>
      </>}
    </section>

    {shops.length > 0 && <section className="gf-shops" ref={shopsRef} aria-labelledby="gw-shops-h">
      <div className="gf-sec-head"><h2 id="gw-shops-h">Urganch do‘konlari</h2><button className="gf-link" onClick={openShops}>Barchasi <ArrowRight size={15} /></button></div>
      <motion.ul variants={{ hide: {}, show: { transition: { staggerChildren: 0.09 } } }} initial="hide" whileInView="show" viewport={{ once: true, amount: 0.25 }}>
        {shops.map(shop => {
          const on = shopFilter === shop.id;
          return <motion.li key={shop.id} variants={{ hide: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease } } }}>
            <button className={`gf-shop${on ? ' on' : ''}`} aria-pressed={on} onClick={() => { setShopFilter(on ? 'all' : shop.id); window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }); }}>
              <span className="gf-shop-name">{shop.name}</span>
              <span className="gf-shop-sub">{shop.subtitle}</span>
              <span className="gf-shop-meta"><Truck size={14} />{money(shop.deliveryFee)}<i aria-hidden="true" /><Clock3 size={14} />{shop.deliveryTime}</span>
              <span className="gf-shop-count">{products.filter(p => p.shopId === shop.id).length} ta gul<ArrowUpRight size={18} /></span>
            </button>
          </motion.li>;
        })}
      </motion.ul>
    </section>}

    <ul className="gf-promise">
      <li><Truck size={20} /><span><strong>Yetkazish haqi oldindan ko‘rinadi</strong>Savatda yashirin to‘lov yo‘q</span></li>
      <li><Flower2 size={20} /><span><strong>Buyurtma bitta do‘konga boradi</strong>Do‘kon o‘zi tayyorlaydi va yetkazadi</span></li>
      <li><ShieldCheck size={20} /><span><strong>To‘lov — yetkazilganda</strong>Do‘kon tasdiqlaganidan keyin</span></li>
    </ul>

    {grid && <Dialog title="Hamma guldastalar" onClose={() => setGrid(false)}>
      {list.length ? <ul className="gw-grid">{list.map((p, i) => <li key={p.id}><button onClick={() => { setGrid(false); setTimeout(() => goTo(i), 120); }}>
        <img src={p.image} alt="" loading="lazy" /><span>{p.name}</span><small>{nf.format(p.price)} so‘m</small>
      </button></li>)}</ul> : <p>Mos guldasta yo‘q.</p>}
    </Dialog>}

    {flights.map(f => <motion.img key={f.id} className="gw-fly" src={f.src} alt="" aria-hidden="true"
      initial={{ x: f.x0, y: f.y0, width: f.size, height: f.size, opacity: 1, scale: 1 }}
      animate={{ x: f.x1, y: [f.y0, f.y0 - 90, f.y1], width: 28, height: 28, opacity: [1, 1, 0.85], scale: 1 }}
      transition={{ duration: 0.95, ease: [0.55, 0, 0.25, 1] }}
      onAnimationComplete={() => setFlights(list => list.filter(x => x.id !== f.id))} />)}
  </div></MotionConfig>;
}

function Ring({ pos, dia, reduce }: { pos: MotionValue<number>; dia: number; reduce: boolean }) {
  const rotate = useTransform(pos, p => p * 26);
  const rotateBack = useTransform(pos, p => -p * 15);
  return <>
    <motion.div className="gw-ring" aria-hidden="true" style={{ width: dia * 1.3, height: dia * 1.3, rotate: reduce ? 0 : rotate }} />
    <motion.div className="gw-ring thin" aria-hidden="true" style={{ width: dia * 1.62, height: dia * 1.62, rotate: reduce ? 0 : rotateBack }} />
  </>;
}
