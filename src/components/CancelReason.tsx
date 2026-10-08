import { Info, Phone } from 'lucide-react';
import type { Order, Shop } from '../types';

const text = {
  customer: 'Siz bu buyurtmani bekor qildingiz. Gullar do‘konga qaytarildi, to‘lov olinmagan.',
  expired: 'Do‘kon belgilangan muddatda javob bermadi, shuning uchun buyurtma avtomatik bekor qilindi. To‘lov olinmagan.',
  shop: 'Do‘kon buyurtmani qabul qila olmadi. To‘lov olinmagan.',
  other: 'Buyurtma bekor qilindi. To‘lov olinmagan.',
} as const;

/** Why a cancelled order was cancelled, and what the buyer can do next. */
export function CancelReason({ order, shop, onOtherShop }: { order: Order; shop?: Shop; onOtherShop: () => void }) {
  const reason = order.cancelReason || (order.cancelledBy === 'customer' ? 'customer' : 'other');
  return <div className={`cancel-reason ${reason}`} role="note">
    <Info size={16} aria-hidden="true" />
    <div>
      <p>{text[reason]}</p>
      {reason !== 'customer' && <p className="cancel-next">Qayta buyurtma bering, boshqa do‘kondan tanlang{shop?.phone ? ' yoki do‘konga qo‘ng‘iroq qiling' : ''}.
        <span>{shop?.phone && <a href={`tel:${shop.phone}`}><Phone size={14} /> {shop.name}ga qo‘ng‘iroq</a>}<button type="button" onClick={onOtherShop}>Boshqa do‘kon tanlash</button></span></p>}
    </div>
  </div>;
}
