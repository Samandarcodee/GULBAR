import { useSyncExternalStore } from 'react';
import { isOpen, hoursLabel } from '../../server/hours.js';
import type { Shop } from '../types';

// One shared minute ticker for the whole app, so open/closed labels stay right without a timer per card.
const listeners = new Set<() => void>();
let current = Math.floor(Date.now() / 60000);
let timer: ReturnType<typeof setInterval> | undefined;
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  if (!timer) timer = setInterval(() => { const next = Math.floor(Date.now() / 60000); if (next !== current) { current = next; listeners.forEach(l => l()); } }, 15000);
  return () => { listeners.delete(fn); if (!listeners.size && timer) { clearInterval(timer); timer = undefined; } };
};
/** Current time, refreshed once a minute. */
export const useNow = () => new Date(useSyncExternalStore(subscribe, () => current) * 60000);

export function shopStatus(shop: Pick<Shop, 'hours'> | undefined, now: Date) {
  const hasHours = !!shop?.hours && !!hoursLabel(shop.hours);
  const open = isOpen(shop?.hours, now);
  return { hasHours, open, label: hoursLabel(shop?.hours), opensAt: hasHours && !open ? shop!.hours!.open : '', closesAt: hasHours && open ? shop!.hours!.close : '' };
}
