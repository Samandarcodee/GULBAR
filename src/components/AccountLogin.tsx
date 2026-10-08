import { useState, type FormEvent } from 'react';
import { LockKeyhole } from 'lucide-react';
import { api } from '../lib/api';
import type { AccountAuth, AccountUser } from '../types';

export function AccountLogin({ role, onLogin }: { role: 'admin' | 'merchant'; onLogin: (auth: AccountAuth) => void }) {
  const [auth, setAuth] = useState<AccountAuth | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError('');
    const form = new FormData(e.currentTarget);
    try {
      if (auth) {
        if (form.get('newPassword') !== form.get('confirmPassword')) throw new Error('Yangi parollar bir xil bo‘lsin.');
        const user = await api<AccountUser>('/auth/password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword: form.get('newPassword') }) }, auth.token);
        setCurrentPassword(''); onLogin({ ...auth, user });
      } else {
        const initial = String(form.get('password'));
        const result = await api<AccountAuth>('/auth/login', { method: 'POST', body: JSON.stringify({ login: form.get('login'), password: initial }) });
        if (result.user.role !== role) { await api('/auth/logout', { method: 'POST' }, result.token); throw new Error(role === 'admin' ? 'Bu hisob admin paneli uchun emas.' : 'Bu hisob do‘kon paneli uchun emas.'); }
        if (result.user.mustChangePassword) { setAuth(result); setCurrentPassword(initial); }
        else onLogin(result);
      }
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <form className="merchant-login" onSubmit={submit} key={auth ? 'change' : 'login'}><div className="merchant-welcome"><LockKeyhole size={28} /><h2>{auth ? 'O‘zingizga yangi parol qo‘ying' : role === 'admin' ? 'Administrator kirishi' : 'Do‘kon hisobiga kirish'}</h2><p>{auth ? 'Vaqtinchalik parolni birinchi kirishda almashtiring. Kamida 12 belgidan foydalaning.' : role === 'admin' ? 'Do‘konlar va ularning login hisoblarini boshqaring.' : 'GulBar administratoridan olgan login va parolingizni kiriting.'}</p></div>
    {auth ? <><label className="field">Yangi parol<input name="newPassword" type="password" minLength={12} maxLength={128} autoComplete="new-password" required /></label><label className="field">Yangi parolni takrorlang<input name="confirmPassword" type="password" minLength={12} maxLength={128} autoComplete="new-password" required /></label></> : <><label className="field">Login<input name="login" autoComplete="username" pattern="[a-zA-Z0-9._-]{3,40}" maxLength={40} required /></label><label className="field">Parol<input name="password" type="password" autoComplete="current-password" maxLength={128} required /></label></>}
    {error && <p className="error-banner" role="alert">{error}</p>}<button className="primary full" disabled={busy}>{busy ? 'Tekshirilmoqda…' : auth ? 'Yangi parolni saqlash' : 'Kirish'}</button>{auth && <button type="button" className="text-button" disabled={busy} onClick={() => { void api('/auth/logout', { method: 'POST' }, auth.token).catch(() => {}); setAuth(null); setCurrentPassword(''); setError(''); }}>Kirishga qaytish</button>}
  </form>;
}
