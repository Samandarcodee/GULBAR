import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Clock3, MapPin, MessageSquare, Phone, Truck } from 'lucide-react';
import type { CartItem, Catalog, Product, Shop } from '../types';
import { api, haptic, money } from '../lib/api';
import { Item } from './HomeMinimal';
import { useFly } from './Fly';
import { shopStatus, useNow } from '../lib/hours-ui';
import { RatingLine, Stars, type ReviewList } from './Reviews';

const ease = [0.22, 1, 0.36, 1] as const;
const months = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
// Browsers have no Uzbek month names, so they are spelled out here (Tashkent time).
const fmt = (iso: string) => { const d = new Date(new Date(iso).getTime() + 5 * 3600000); return `${d.getUTCDate()}-${months[d.getUTCMonth()]}, ${d.getUTCFullYear()}`; };

export function ShopPage({ shop, catalog, favorites, cart, back, open, add, toggleFavorite }: { shop: Shop; catalog: Catalog; favorites: string[]; cart: CartItem[]; back: () => void; open: (p: Product) => void; add: (p: Product) => void; toggleFavorite: (id: string) => void }) {
  const { fly, layer } = useFly();
  const st = shopStatus(shop, useNow());
  const [reviews, setReviews] = useState<ReviewList | null>(null);
  const [failed, setFailed] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  useEffect(() => {
    let live = true; setReviews(null); setFailed(false);
    api<ReviewList>(`/shops/${shop.id}/reviews`).then(r => { if (live) setReviews(r); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [shop.id]);
  const products = catalog.products.filter(p => p.shopId === shop.id);
  const dist = reviews ? [5, 4, 3, 2, 1].map(n => ({ n, c: reviews.items.filter(r => r.rating === n).length })) : [];
  return <main className="page-content shop-page">
    <button className="text-button" onClick={back}><ArrowLeft size={18} /> Orqaga</button>
    <motion.header className="shop-head" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease }}>
      <span className="shop-avatar-lg" style={{ background: shop.color }}>{shop.logo && !logoFailed ? <img src={shop.logo} alt="" onError={() => setLogoFailed(true)} /> : <b>{shop.initials}</b>}</span>
      <div className="shop-head-text">
        <h1>{shop.name}</h1>
        <p className="shop-sub">{shop.subtitle}</p>
        <div className="shop-rate"><RatingLine rating={shop.rating} empty="Hali sharh yo‘q" />{st.hasHours && <span className={`open-badge ${st.open ? 'on' : 'off'}`}>{st.open ? `Hozir ochiq · ${st.closesAt} gacha` : `Hozir yopiq · ${st.opensAt} da ochiladi`}</span>}</div>
      </div>
    </motion.header>
    <motion.ul className="shop-facts" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease, delay: 0.08 }}>
      <li><MapPin size={18} aria-hidden="true" /><span>{shop.address}</span></li>
      {st.hasHours && <li><Clock3 size={18} aria-hidden="true" /><span>Ish vaqti {st.label}</span></li>}
      <li><Truck size={18} aria-hidden="true" /><span>Yetkazish {money(shop.deliveryFee)}</span></li>
      <li><Truck size={18} aria-hidden="true" /><span>Yetkazish muddati {shop.deliveryTime}</span></li>
    </motion.ul>
    {shop.phone && <a className="primary shop-call" href={`tel:${shop.phone}`} onClick={() => haptic()}><Phone size={18} /> Do‘konga qo‘ng‘iroq qilish</a>}

    <section className="shop-section" aria-labelledby="shop-products-h">
      <div className="gm-count"><h2 id="shop-products-h">Guldastalar</h2><p>{products.length} ta</p></div>
      {products.length ? <ul className="gm-grid">{products.map(p => <Item key={p.id} product={p} shop={shop} favorite={favorites.includes(p.id)} inCart={cart.some(c => c.productId === p.id)}
        open={() => open(p)} add={() => add(p)} toggleFavorite={() => toggleFavorite(p.id)} fly={fly} />)}</ul> : <p className="gm-empty">Bu do‘konda hozircha guldasta yo‘q.</p>}
    </section>

    <section className="shop-section" aria-labelledby="shop-reviews-h">
      <div className="gm-count"><h2 id="shop-reviews-h">Sharhlar</h2><p>{reviews ? `${reviews.count} ta` : ''}</p></div>
      {failed && <p className="muted">Sharhlarni yuklab bo‘lmadi. Birozdan keyin urinib ko‘ring.</p>}
      {!reviews && !failed && <div className="review-skel" aria-hidden="true"><div className="skeleton" /><div className="skeleton" /></div>}
      {reviews && reviews.count === 0 && <div className="review-empty"><MessageSquare size={28} strokeWidth={1.4} aria-hidden="true" /><p><b>Hali sharh yo‘q.</b> Buyurtmangiz yetkazilgach, shu yerda birinchi bo‘lib baho qoldirishingiz mumkin.</p></div>}
      {reviews && reviews.count > 0 && <>
        <div className="review-summary">
          <div className="review-big"><strong>{reviews.avg?.toFixed(1)}</strong><Stars value={reviews.avg || 0} size={18} /><small>{reviews.count} ta baho</small></div>
          <ul className="review-bars" aria-label="Baholar taqsimoti">{dist.map(d => <li key={d.n}><span>{d.n}</span><div><motion.i initial={{ width: 0 }} whileInView={{ width: `${reviews.items.length ? (d.c / reviews.items.length) * 100 : 0}%` }} viewport={{ once: true }} transition={{ duration: 0.8, ease }} /></div></li>)}</ul>
        </div>
        <ul className="review-list">{reviews.items.map((r, i) => <motion.li key={i} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.3 }} transition={{ duration: 0.45, ease }}>
          <div className="review-top"><span className="review-name">{r.name}</span><Stars value={r.rating} size={14} /><time dateTime={r.createdAt}>{fmt(r.createdAt)}</time></div>
          {r.comment && <p>{r.comment}</p>}
        </motion.li>)}</ul>
      </>}
    </section>
    {layer}
  </main>;
}
