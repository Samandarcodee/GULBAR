import { useEffect, useRef, type ReactNode } from 'react';
import { motion, useDragControls, useReducedMotion } from 'motion/react';
import { X } from 'lucide-react';

export function Dialog({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const reduce = useReducedMotion();
  const controls = useDragControls();
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement;
    dialog?.showModal();
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { dialog?.close(); document.body.style.overflow = old; previous?.focus(); };
  }, []);
  return <dialog ref={ref} className={`dialog ${wide ? 'dialog-wide' : ''}`} aria-labelledby="dialog-title" onCancel={e => { e.preventDefault(); onClose(); }}
    onClick={e => { if (e.target === e.currentTarget) { const bounds = e.currentTarget.getBoundingClientRect(); if (e.clientX < bounds.left || e.clientX > bounds.right || e.clientY < bounds.top || e.clientY > bounds.bottom) onClose(); } }}>
    <motion.div drag="y" dragControls={controls} dragListener={false} dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.7 }} dragSnapToOrigin onDragEnd={(_, info) => { if (info.offset.y > 110 || info.velocity.y > 700) onClose(); }}
      initial={{ opacity: 0, y: reduce ? 0 : (innerWidth < 761 ? 80 : 24), scale: reduce || innerWidth < 761 ? 1 : 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={reduce ? { duration: .15 } : { type: 'spring', stiffness: 360, damping: 32, mass: .9 }}>
      <div className="sheet-grab" onPointerDown={e => controls.start(e)} aria-hidden="true"><i /></div>
      <div className="dialog-head"><h2 id="dialog-title">{title}</h2><button className="icon-btn" aria-label="Yopish" onClick={onClose}><X size={22} /></button></div>
      {children}
    </motion.div>
  </dialog>;
}
