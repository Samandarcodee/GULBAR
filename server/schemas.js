import { z } from 'zod';
import { cardStyles } from './delivery.js';
const text = (max) => z.string().trim().min(1).max(max);
const phone = z.string().trim().regex(/^\+998\d{9}$/, 'Telefon: +998 va 9 ta raqam kiriting.');
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const deliveryInputSchema = z.object({
  method: z.enum(['delivery', 'pickup']).default('delivery'), when: z.enum(['asap', 'slot']).default('asap'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), from: hhmm.optional(), to: hhmm.optional(),
  point: z.object({ lat: z.number().min(41.2).max(41.9), lng: z.number().min(60).max(61.3) }).optional(),
});
export const orderSchema = z.object({
  requestKey: z.string().uuid(), shopId: text(80),
  items: z.array(z.object({ productId: text(80), quantity: z.number().int().min(1).max(20) })).min(1).max(30),
  customer: z.object({ name: text(80), phone, recipient: text(80), recipientPhone: phone, address: text(300),
    deliveryTime: z.enum(['soon', 'today-evening', 'tomorrow']), note: z.string().trim().max(500).default(''), anonymous: z.boolean().default(false),
    cardStyle: z.enum(cardStyles).default('classic'), cardFrom: z.string().trim().max(40).default('') }),
  delivery: deliveryInputSchema.optional(),
  payment: z.object({ method: z.enum(['cash', 'card']) }).optional(),
});
export const audiences = ['ona', 'rafiqa', 'qiz', 'dost', 'hamkasb'];
const imageRef = z.string().max(2048).refine(v => /^\/api\/images\/[a-f0-9-]{36}$/.test(v) || /^\/images\/[a-zA-Z0-9-]+\.(jpg|png|webp)$/.test(v) || (v.startsWith('https://') && URL.canParse(v)), 'Rasm tanlang yoki HTTPS rasm manzilini kiriting.');
export const productSchema = z.object({ name: text(100), description: text(1000), price: z.number().int().min(1000).max(10000000),
  category: z.enum(['bouquet', 'rose', 'tulip', 'box']), image: imageRef,
  stock: z.number().int().min(0).max(10000), images: z.array(imageRef).max(5).default([]), audience: z.array(z.enum(audiences)).max(5).default([]), badge: z.string().trim().max(30).default('Guldasta'), active: z.boolean().default(true) });
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Vaqtni HH:MM ko‘rinishida kiriting.');
export const hoursSchema = z.object({ open: time, close: time }).refine(h => h.open !== h.close, 'Ochilish va yopilish vaqti bir xil bo‘lmasin.').nullable().optional();
export const shopSchema = z.object({ id: z.string().regex(/^[a-z0-9-]{2,40}$/), name: text(100), subtitle: text(150), address: text(250),
  deliveryFee: z.number().int().min(0).max(200000), deliveryTime: text(60), color: z.string().regex(/^#[a-fA-F0-9]{6}$/),
  initials: text(3), active: z.boolean(), hours: hoursSchema, logo: z.string().regex(/^\/images\/[a-zA-Z0-9-]+\.(jpg|png|webp)$/).optional() });
export const shopSettingsSchema = shopSchema.pick({ name: true, subtitle: true, address: true, deliveryFee: true, deliveryTime: true, active: true, hours: true });
export const transitions = { pending: ['accepted', 'cancelled'], accepted: ['delivering', 'cancelled'], delivering: ['delivered'], delivered: [], cancelled: [] };
export const statusNames = { pending: 'Do‘kon tasdig‘i kutilmoqda', accepted: 'Qabul qilindi', delivering: 'Yo‘lda', delivered: 'Yetkazildi', cancelled: 'Bekor qilindi' };

