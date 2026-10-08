// Uzbek mobile numbers as people type and paste them. The stored form is always "+998" and nine digits.

/** The nine national digits from whatever was typed or pasted: +998 90 123 45 67, 8 90 123 45 67, 0901234567, (90) 123-45-67 … */
export function nationalDigits(raw) {
  const text = String(raw ?? '');
  let digits = text.replace(/\D/g, '');
  if (text.trim().startsWith('+') && digits.startsWith('998')) digits = digits.slice(3);
  else if (digits.length > 9) {
    // more than a national number can hold, so the extra start is a country code or a trunk prefix
    if (digits.startsWith('998')) digits = digits.slice(3);
    else if (digits.startsWith('8') || digits.startsWith('0')) digits = digits.slice(1);
  }
  return digits.slice(0, 9);
}

/** 901234567 -> "90 123 45 67" (also while it is still being typed) */
export const formatNational = digits => [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5, 7), digits.slice(7, 9)].filter(Boolean).join(' ');

export const toPhone = digits => digits ? `+998${digits}` : '+998';

/** An empty string when the number is complete, otherwise what is missing and an example. */
export function phoneMessage(value) {
  const digits = nationalDigits(value);
  if (digits.length === 9) return '';
  if (!digits) return 'Telefon raqamini yozing, masalan: 90 123 45 67.';
  return 'Telefon raqami to‘liq emas: 9 ta raqam kerak, masalan 90 123 45 67.';
}
