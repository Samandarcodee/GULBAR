export type Shop = { id: string; name: string; subtitle: string; address: string; deliveryFee: number; deliveryTime: string; color: string; initials: string; active: boolean; logo?: string; phone?: string; rating?: { avg: number; count: number }; hours?: { open: string; close: string } | null };
export type Product = { id: string; shopId: string; name: string; description: string; price: number; category: string; image: string; stock: number; badge: string; active?: boolean; audience?: string[]; images?: string[] };
export type MerchantWorkspace = { shop: Shop; products: Product[] };
export type AccountUser = { id: string; login: string; role: 'admin' | 'merchant'; shopId: string | null; mustChangePassword: boolean };
export type AccountAuth = { token: string; user: AccountUser };
export type AdminShop = Shop & { phone: string; telegramChatId: string; login: string; accountEnabled: boolean; products?: number };
export type CartItem = { productId: string; quantity: number };
export type Delivery = { method: 'delivery' | 'pickup'; when: 'asap' | 'slot'; date?: string; from?: string; to?: string; point?: { lat: number; lng: number } };
export type Customer = { cardStyle?: string; cardFrom?: string; name: string; phone: string; recipient: string; recipientPhone: string; address: string; deliveryTime: 'soon' | 'today-evening' | 'tomorrow'; note: string; anonymous: boolean };
export type Order = { id: string; shopId: string; shopName: string; items: (CartItem & { name: string; image: string; price: number })[]; customer: Customer; total: number; subtotal: number; deliveryFee: number; status: string; demo: boolean; createdAt: string; notification: string; reviewed?: boolean; afterHours?: boolean; respondFrom?: string; delivery?: Delivery; cancelledBy?: string; cancelReason?: 'customer' | 'shop' | 'expired' };
export type Catalog = { shops: Shop[]; products: Product[]; demo: boolean; merchantProtected?: boolean };
declare global {
  interface Window {
    Telegram?: { WebApp: {
      initData: string; colorScheme: string; initDataUnsafe?: { user?: { first_name?: string } };
      ready(): void; expand(): void; isVersionAtLeast(version: string): boolean;
      setHeaderColor(color: string): void; setBackgroundColor(color: string): void;
      BackButton: { show(): void; hide(): void; onClick(fn: () => void): void; offClick(fn: () => void): void };
      HapticFeedback?: { impactOccurred(style: string): void; notificationOccurred(type: string): void };
      openTelegramLink?(url: string): void;
      onEvent(name: string, fn: () => void): void; offEvent(name: string, fn: () => void): void;
      contentSafeAreaInset?: { top: number; bottom: number };
    } };
  }
}
