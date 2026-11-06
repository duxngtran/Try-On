import { createContext, useContext } from 'react';

/**
 * @typedef {{
 *   get: () => { name: string, phone: string, address: string, key: string | null },
 *   save: (fields: Partial<{ name: string, phone: string, address: string }>) => void,
 *   ensureKey: () => string,
 *   clear: () => void,
 * }} CheckoutDraftValue
 */

export const CheckoutDraftContext = createContext(/** @type {CheckoutDraftValue | null} */ (null));

export function useCheckoutDraft() {
  const value = useContext(CheckoutDraftContext);
  if (!value) throw new Error('useCheckoutDraft phải được dùng bên trong <CheckoutDraftProvider>');
  return value;
}
