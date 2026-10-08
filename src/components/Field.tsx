import { useId } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { formatNational, nationalDigits, toPhone } from '../../server/phone.js';

type Shared = { name: string; label: string; error?: string; hint?: string; optional?: boolean; onBlur?: () => void };

const Label = ({ id, label, optional }: { id: string; label: string; optional?: boolean }) =>
  <div className="field-label"><label htmlFor={id}>{label}</label>{optional && <span className="optional">ixtiyoriy</span>}</div>;
const Problem = ({ id, error }: { id: string; error?: string }) =>
  error ? <p className="field-error" id={id} aria-live="polite"><AlertCircle size={15} aria-hidden="true" />{error}</p> : null;

/** A text field with its label above, an example in the placeholder, a hint, and the problem written under it. */
export function TextField({ name, label, value, onChange, onBlur, error, hint, optional, placeholder, autoComplete = 'off', inputMode, maxLength, multiline, rows = 2, autoCapitalize, enterKeyHint }: Shared & {
  value: string; onChange: (value: string) => void; placeholder?: string; autoComplete?: string; inputMode?: 'text' | 'numeric' | 'tel' | 'email';
  maxLength?: number; multiline?: boolean; rows?: number; autoCapitalize?: 'words' | 'sentences' | 'none'; enterKeyHint?: 'next' | 'done' | 'go';
}) {
  const id = useId(), errorId = `${id}-error`, hintId = `${id}-hint`;
  const props = {
    id, name, value, placeholder, autoComplete, maxLength, autoCapitalize, enterKeyHint, onBlur,
    onChange: (e: { target: { value: string } }) => onChange(e.target.value),
    'aria-invalid': !!error, 'aria-describedby': [error ? errorId : '', hint ? hintId : ''].filter(Boolean).join(' ') || undefined,
  };
  return <div className="field">
    <Label id={id} label={label} optional={optional} />
    {multiline ? <textarea {...props} rows={rows} /> : <input {...props} inputMode={inputMode} />}
    {multiline && maxLength && value.length > maxLength * 0.7 && <span className="field-count" aria-hidden="true">{value.length}/{maxLength}</span>}
    {hint && !error && <p className="field-hint" id={hintId}>{hint}</p>}
    <Problem id={errorId} error={error} />
  </div>;
}

/** An Uzbek phone number: "+998" is fixed, any pasted format is understood, the stored value is +998 and nine digits. */
export function PhoneField({ name, label, value, onChange, onBlur, error, hint, optional }: Shared & { value: string; onChange: (phone: string) => void }) {
  const id = useId(), errorId = `${id}-error`, hintId = `${id}-hint`;
  const digits = nationalDigits(value);
  return <div className="field">
    <Label id={id} label={label} optional={optional} />
    <div className="phone-input" data-invalid={!!error}>
      <span className="phone-prefix" aria-hidden="true">+998</span>
      <input id={id} name={name} type="tel" inputMode="numeric" autoComplete="tel-national" spellCheck={false} enterKeyHint="next" placeholder="90 123 45 67"
        value={formatNational(digits)} onChange={e => onChange(toPhone(nationalDigits(e.target.value)))} onBlur={onBlur}
        aria-invalid={!!error} aria-describedby={[error ? errorId : '', hint ? hintId : ''].filter(Boolean).join(' ') || undefined} />
      {digits.length === 9 && !error && <CheckCircle2 className="phone-ok" size={18} aria-hidden="true" />}
    </div>
    {hint && !error && <p className="field-hint" id={hintId}>{hint}</p>}
    <Problem id={errorId} error={error} />
  </div>;
}
