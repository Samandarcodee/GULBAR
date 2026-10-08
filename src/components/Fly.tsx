import { useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';

type Flight = { id: number; src: string; x0: number; y0: number; size: number; x1: number; y1: number };

/** Lets a photo fly into the cart: from the card to the header bag, or to the bottom cart bar on a phone. */
export function useFly() {
  const reduce = useReducedMotion();
  const [flights, setFlights] = useState<Flight[]>([]);
  const counter = useRef(0);
  const fly = (from: Element | null, src: string) => {
    if (reduce || !from) return;
    const r = from.getBoundingClientRect();
    const bar = document.querySelector('.home-cart-bar')?.getBoundingClientRect();
    const bag = document.querySelector('.bag-button')?.getBoundingClientRect();
    const size = Math.min(110, Math.min(r.width, r.height) * 0.6);
    let tx = innerWidth / 2, ty = innerHeight - 100;
    if (bar) { tx = bar.left + 46; ty = bar.top + bar.height / 2; }
    else if (bag && bag.bottom > 0 && bag.top < innerHeight) { tx = bag.left + bag.width / 2; ty = bag.top + bag.height / 2; }
    setFlights(f => [...f, { id: ++counter.current, src, size, x0: r.left + r.width / 2 - size / 2, y0: r.top + r.height / 2 - size / 2, x1: tx - 13, y1: ty - 13 }]);
  };
  const layer = <>{flights.map(f => <motion.img key={f.id} className="fly-img" src={f.src} alt="" aria-hidden="true"
    initial={{ x: f.x0, y: f.y0, width: f.size, height: f.size, opacity: 1 }}
    animate={{ x: f.x1, y: [f.y0, Math.min(f.y0, f.y1) - 80, f.y1], width: 26, height: 26, opacity: [1, 1, 0.9] }}
    transition={{ duration: 0.9, ease: [0.55, 0, 0.25, 1] }}
    onAnimationComplete={() => setFlights(list => list.filter(x => x.id !== f.id))} />)}</>;
  return { fly, layer };
}
