import { Heart, Plus, Check } from 'lucide-react';
import { motion } from 'motion/react';
import type { Product, Shop } from '../types';
import { money } from '../lib/api';

export function ProductCard({ product, shop, favorite, inCart, toggleFavorite, add, open }: {
  product: Product; shop?: Shop; favorite: boolean; inCart: boolean;
  toggleFavorite: () => void; add: () => void; open: () => void;
}) {
  return <article className="product-card">
    <div className="product-photo">
      <button className="photo-button" onClick={open} aria-label={`${product.name} haqida`}><img src={product.image} alt={product.name} loading="lazy" onError={e => e.currentTarget.classList.add('image-failed')} /></button>
      <span className="product-tag">{product.badge}</span>
      <button className={`favorite-btn ${favorite ? 'is-favorite' : ''}`} onClick={toggleFavorite} aria-label={`${product.name}: sevimlilar`} aria-pressed={favorite}><Heart size={19} fill={favorite ? 'currentColor' : 'none'} /></button>
      {product.stock === 0 && <span className="sold-out">Vaqtincha tugagan</span>}
    </div>
    <div className="product-info"><span className="shop-caption">{shop?.name}</span><button className="product-title" onClick={open}>{product.name}</button>
      <div className="product-bottom"><strong>{money(product.price)}</strong><motion.button whileTap={{ scale: .92 }} className={`add-btn ${inCart ? 'in-cart' : ''}`} disabled={product.stock === 0} onClick={add} aria-label={`${product.name}ni savatga qo‘shish`}>{inCart ? <Check size={19} /> : <Plus size={21} />}</motion.button></div>
    </div>
  </article>;
}
