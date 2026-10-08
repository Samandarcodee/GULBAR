import { useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, ChevronRight, Check, Clock3, Link2, Send, ShoppingBag, Truck } from 'lucide-react';
import type { Product, Shop } from '../types';
import { money } from '../lib/api';
import { RatingLine } from './Reviews';
import { shopStatus, useNow } from '../lib/hours-ui';

const ease = [0.22, 1, 0.36, 1] as const;

/** Product details: swipeable photos, shop row (opens the shop page), share, add to cart. */
export function ProductSheet({ product, shop, onAdd, onOpenShop }: { product: Product; shop?: Shop; onAdd: () => void; onOpenShop: () => void }) {
  const st = shopStatus(shop, useNow());
  const photos = [...new Set([product.image, ...(product.images || [])])];
  const strip = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);
  const go = (i: number) => { const el = strip.current; if (!el) return; const t = Math.max(0, Math.min(photos.length - 1, i)); el.scrollTo({ left: t * el.clientWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); };
  async function share() {
    const url = `${location.origin}/?product=${product.id}`, text = `${product.name} — ${money(product.price)}`;
    const tg = window.Telegram?.WebApp;
    if (tg?.openTelegramLink) { tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`); return; }
    try { if (navigator.share) { await navigator.share({ title: product.name, text, url }); return; } } catch { return; }
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2200); } catch { /* nothing else to try */ }
  }
  return <div className="sheet">
    <div className="sheet-gallery">
      <div className="sheet-strip" ref={strip} onScroll={e => { const el = e.currentTarget; setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth))); }} tabIndex={0} aria-label={`${product.name} suratlari`}>
        {photos.map((src, i) => <motion.div className="sheet-slide" key={src} initial={{ opacity: 0, scale: 1.06 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, ease, delay: i ? 0 : 0.05 }}>
          {failed[src] ? <span className="sheet-missing">Rasm hozir ochilmadi</span> : <img src={src} alt={i === 0 ? product.name : `${product.name}, ${i + 1}-surat`} onError={() => setFailed(f => ({ ...f, [src]: true }))} />}
        </motion.div>)}
      </div>
      {photos.length > 1 && <>
        <button className="sheet-arrow prev" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Oldingi surat"><ChevronLeft size={20} /></button>
        <button className="sheet-arrow next" onClick={() => go(index + 1)} disabled={index === photos.length - 1} aria-label="Keyingi surat"><ChevronRight size={20} /></button>
        <div className="sheet-dots" aria-hidden="true">{photos.map((p, i) => <motion.i key={p} animate={{ width: i === index ? 20 : 7, opacity: i === index ? 1 : 0.55 }} transition={{ duration: 0.25 }} />)}</div>
      </>}
    </div>
    <motion.div className="sheet-body" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease, delay: 0.1 }}>
      <div className="sheet-price-row"><strong className="sheet-price">{money(product.price)}</strong>
        <button className="sheet-share" onClick={share} aria-label="Guldastani ulashish">{copied ? <><Check size={16} /> Nusxalandi</> : <>{window.Telegram?.WebApp?.openTelegramLink ? <Send size={16} /> : <Link2 size={16} />} Ulashish</>}</button></div>
      <p className="sheet-desc">{product.description}</p>
      {shop && <button className="sheet-shop" onClick={onOpenShop}>
        <span className="sheet-avatar" style={{ background: shop.color }}>{shop.logo ? <img src={shop.logo} alt="" /> : shop.initials}</span>
        <span className="sheet-shop-text"><b>{shop.name}</b><RatingLine rating={shop.rating} /></span><ChevronRight size={18} aria-hidden="true" />
      </button>}
      <div className="sheet-facts">
        <span><Truck size={17} aria-hidden="true" /> Yetkazish {money(shop?.deliveryFee || 0)}</span>
        <span><Clock3 size={17} aria-hidden="true" /> {shop?.deliveryTime || 'Vaqtni do‘kon tasdiqlaydi'}</span>
      </div>
      {st.hasHours && !st.open && <p className="sheet-closed" role="status"><Clock3 size={16} aria-hidden="true" /> Do‘kon hozir yopiq (ish vaqti {st.label}). Ertangi yetkazish uchun buyurtma berishingiz mumkin.</p>}
      <motion.button whileTap={{ scale: 0.98 }} className="primary full" disabled={!product.stock} onClick={onAdd}>{product.stock ? 'Savatga qo‘shish' : 'Vaqtincha mavjud emas'} <ShoppingBag size={18} /></motion.button>
    </motion.div>
  </div>;
}
