import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Inbox, Send } from 'lucide-react';
import { api } from '../lib/api';

type Row = { id: string; kind: 'complaint' | 'question' | 'suggestion'; message: string; status: 'new' | 'done'; reply: string; createdAt: string; orderShort: string; shopName: string; contact: string; canReplyInTelegram: boolean };
const names = { complaint: 'Shikoyat', question: 'Savol', suggestion: 'Taklif' } as const;
const when = (iso: string) => new Date(iso).toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Admin: buyers' complaints, questions and suggestions with a reply box (the reply is also sent in Telegram). */
export function SupportInbox({ token }: { token: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(async () => { try { setRows(await api<Row[]>('/admin/support', {}, token)); setError(''); } catch (e) { setError((e as Error).message); } }, [token]);
  useEffect(() => { void load(); }, [load]);
  async function send(row: Row, body: { reply?: string; status?: 'new' | 'done' }) {
    setBusy(row.id); setError('');
    try { await api(`/admin/support/${row.id}`, { method: 'PATCH', body: JSON.stringify(body) }, token); setDrafts(d => ({ ...d, [row.id]: '' })); await load(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  }
  const fresh = rows?.filter(r => r.status === 'new').length || 0;
  return <section className="inbox" aria-labelledby="inbox-h">
    <div className="merchant-section-heading"><div><h2 id="inbox-h">Murojaatlar{fresh ? <span className="inbox-count">{fresh} yangi</span> : null}</h2><p>Xaridorlarning shikoyat, savol va takliflari.</p></div></div>
    {error && <p className="error-banner" role="alert">{error}</p>}
    {rows && !rows.length && <div className="empty"><Inbox size={34} /><h3>Murojaat yo‘q</h3><p>Xaridorlar yozganda shu yerda ko‘rinadi.</p></div>}
    <div className="inbox-list">{rows?.map(r => <article key={r.id} className={`inbox-item ${r.status}`}>
      <header><b>{names[r.kind]}</b><span className={`ticket-state ${r.status}`}>{r.status === 'done' ? 'Hal qilindi' : 'Yangi'}</span><time dateTime={r.createdAt}>{when(r.createdAt)}</time></header>
      {(r.orderShort || r.shopName) && <p className="inbox-meta">Buyurtma #{r.orderShort}{r.shopName ? ` · ${r.shopName}` : ''}{r.contact ? ` · ${r.contact}` : ''}</p>}
      <p className="inbox-message">{r.message}</p>
      {r.reply && <p className="ticket-reply"><b>Javobingiz:</b> {r.reply}</p>}
      <label className="field">Javob<textarea rows={3} maxLength={1000} value={drafts[r.id] || ''} onChange={e => setDrafts(d => ({ ...d, [r.id]: e.target.value }))} placeholder={r.canReplyInTelegram ? 'Javob xaridorning Telegramiga ham yuboriladi' : 'Javob ilovada ko‘rinadi'} /></label>
      <div className="order-actions">
        <button className="primary" disabled={busy === r.id || !(drafts[r.id] || '').trim()} onClick={() => send(r, { reply: drafts[r.id] })}><Send size={16} /> Javob yuborish</button>
        {r.status === 'new' ? <button className="secondary" disabled={busy === r.id} onClick={() => send(r, { status: 'done' })}><CheckCircle2 size={16} /> Hal qilindi</button> : <button className="secondary" disabled={busy === r.id} onClick={() => send(r, { status: 'new' })}>Qayta ochish</button>}
      </div>
    </article>)}</div>
  </section>;
}
