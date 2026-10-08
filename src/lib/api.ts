const storage = {
  get(key: string) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* session-only fallback */ } },
};
const demoId = storage.get('flowrs-user') || crypto.randomUUID();
storage.set('flowrs-user', demoId);
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}
export async function api<T>(path: string, options: RequestInit = {}, merchantToken?: string): Promise<T> {
  const response = await fetch(`/api${path}`, { ...options,
    headers: { 'Content-Type': 'application/json', 'X-Demo-User': demoId,
      'X-Telegram-Init-Data': window.Telegram?.WebApp.initData || '',
      ...(merchantToken ? { Authorization: `Bearer ${merchantToken}` } : {}), ...options.headers },
  });
  let data;
  try { data = await response.json(); } catch { throw new Error('Server bilan bog‘lanib bo‘lmadi.'); }
  if (!response.ok) throw new ApiError(data.error || 'So‘rov bajarilmadi.', response.status);
  return data as T;
}
export function readStored<T>(key: string, fallback: T): T {
  try { return JSON.parse(storage.get(key) || 'null') ?? fallback; } catch { return fallback; }
}
export function writeStored(key: string, data: unknown) { storage.set(key, JSON.stringify(data)); }
export const money = (n: number) => `${new Intl.NumberFormat('uz-UZ').format(n)} so‘m`;
export const statusNames: Record<string, string> = { pending: 'Tasdiq kutilmoqda', accepted: 'Qabul qilindi', delivering: 'Yo‘lda', delivered: 'Yetkazildi', cancelled: 'Bekor qilindi' };
export function haptic() { window.Telegram?.WebApp.HapticFeedback?.impactOccurred('light'); }
