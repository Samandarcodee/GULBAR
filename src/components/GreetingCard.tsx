import { Flower2, Heart, Leaf, Sparkles } from 'lucide-react';
import { cardNames, cardStyles } from '../../server/delivery.js';

const marks: Record<string, typeof Flower2 | null> = { classic: Heart, rose: Flower2, gold: Sparkles, spring: Leaf, minimal: null };
export const styles: string[] = cardStyles;

/** A greeting card as the florist will write it: five paper styles, the message and who it is from. */
export function GreetingCard({ style, text, from, small = false }: { style: string; text?: string; from?: string; small?: boolean }) {
  const Mark = marks[style] ?? null;
  return <div className={`gcard gcard-${style}${small ? ' small' : ''}`}>
    {Mark && <Mark className="gcard-mark" size={small ? 22 : 34} strokeWidth={1.2} aria-hidden="true" />}
    <p className="gcard-text">{text?.trim() || (small ? cardNames[style as keyof typeof cardNames] : 'Tabrik matningiz shu yerda ko‘rinadi…')}</p>
    {!small && from?.trim() && <p className="gcard-from">— {from.trim()}</p>}
  </div>;
}
export const cardName = (style: string): string => (cardNames as Record<string, string>)[style] || style;
