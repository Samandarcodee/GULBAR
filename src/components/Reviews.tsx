import { useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import { Star } from 'lucide-react';
import type { Order } from '../types';
import { api, haptic } from '../lib/api';
import { Dialog } from './Dialog';

export type ReviewList = { avg: number | null; count: number; items: { name: string; rating: number; comment: string; createdAt: string }[] };
const words = ['', 'Yoqmadi', 'Qoniqarsiz', 'Yomon emas', 'Yaxshi', 'Ajoyib'];

/** Read-only stars (supports halves visually through the filled width). */
export function Stars({ value, size = 16 }: { value: number; size?: number }) {
  return <span className="stars" role="img" aria-label={`${value} / 5`} style={{ ['--s' as string]: `${size}px` }}>
    {[1, 2, 3, 4, 5].map(n => <Star key={n} size={size} strokeWidth={1.6} className={value >= n - 0.25 ? 'on' : value >= n - 0.75 ? 'half' : ''} aria-hidden="true" />)}
  </span>;
}

export function RatingLine({ rating, empty = 'Yangi' }: { rating?: { avg: number; count: number }; empty?: string }) {
  if (!rating?.count) return <span className="rating-line muted">{empty}</span>;
  return <span className="rating-line"><Star size={14} className="on" aria-hidden="true" /><b>{rating.avg.toFixed(1)}</b><span>({rating.count})</span></span>;
}

export function ReviewDialog({ order, onClose, onDone }: { order: Order; onClose: () => void; onDone: () => void }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!rating) { setError('Avval yulduzchalardan birini tanlang.'); return; }
    setBusy(true); setError('');
    try { await api(`/orders/${order.id}/review`, { method: 'POST', body: JSON.stringify({ rating, comment }) }); onDone(); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  return <Dialog title="Xizmatni baholang" onClose={() => { if (!busy) onClose(); }}>
    <form className="review-form" onSubmit={submit} noValidate>
      <p className="review-shop">{order.shopName}</p>
      <div className="star-input" role="radiogroup" aria-label="Baho">
        {[1, 2, 3, 4, 5].map(n => <motion.button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} yulduz — ${words[n]}`} className={rating >= n ? 'on' : ''}
          whileTap={{ scale: 0.85 }} animate={rating === n ? { scale: [1, 1.3, 1] } : { scale: 1 }} transition={{ duration: 0.35 }}
          onClick={() => { haptic(); setRating(n); setError(''); }}><Star size={34} strokeWidth={1.5} /></motion.button>)}
      </div>
      <p className="star-word" aria-live="polite">{rating ? words[rating] : 'Yulduzchani bosing'}</p>
      <label className="field">Fikringiz (ixtiyoriy)<textarea value={comment} onChange={e => setComment(e.target.value)} maxLength={500} rows={4} placeholder="Gullar yangi edimi? Yetkazish vaqtida keldimi?" /></label>
      {error && <p className="error-banner" role="alert">{error}</p>}
      <button className="primary full" disabled={busy}>{busy ? 'Yuborilmoqda…' : 'Baho yuborish'}</button>
      <p className="field-help">Sharhda faqat ismingizning birinchi so‘zi ko‘rinadi.</p>
    </form>
  </Dialog>;
}
