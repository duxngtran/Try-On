import { createContext, useContext } from 'react';

/**
 * @typedef {{
 *   productId: string, name: string, category: { id: string, name: string },
 *   image: { url: string, version: number }, quantity: number, priceVnd: number | null,
 *   lineTotalVnd: number, priceChangedFrom: number | null, available: boolean,
 * }} CartItem
 * @typedef {{
 *   items: CartItem[], itemCount: number, lineCount: number, totalVnd: number,
 *   hasUnavailable: boolean, fingerprint: string | null,
 *   limits: { maxQuantity: number, maxLines: number },
 * }} Cart
 * @typedef {{ ok: true } | { ok: false, skipped?: boolean, code?: string, details?: unknown }} AddOutcome
 * @typedef {{ ok: true, cart: Cart } | { ok: false, skipped?: boolean, code?: string, details?: unknown, cart?: Cart | null }} MutateOutcome
 * @typedef {{
 *   cart: Cart | null,
 *   status: 'idle' | 'loading' | 'ready' | 'error',
 *   isAdding: (productId: string) => boolean,
 *   isLineBusy: (productId: string) => boolean,
 *   setQuantity: (productId: string, quantity: number) => Promise<MutateOutcome>,
 *   removeItem: (productId: string) => Promise<MutateOutcome>,
 *   addItem: (input: { productId: string, name: string, priceVnd: number, isShown?: () => boolean }) => Promise<AddOutcome>,
 *   refresh: () => Promise<Cart | null>,
 *   notice: { id: number, kind: 'success' | 'error', message: string } | null,
 * }} CartValue
 */

export const CartContext = createContext(/** @type {CartValue | null} */ (null));

export function useCart() {
  const value = useContext(CartContext);
  if (!value) throw new Error('useCart phải được dùng bên trong <CartProvider>');
  return value;
}
