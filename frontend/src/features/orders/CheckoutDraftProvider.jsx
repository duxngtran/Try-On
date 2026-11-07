import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/authContext.js';
import { CheckoutDraftContext } from './checkoutDraftContext.js';
import { makeIdempotencyKey } from './orderFormat.js';

const emptyDraft = () => ({ name: '', phone: '', address: '', key: null });

/** Nơi giữ dữ liệu form trong bộ nhớ của trang, gắn với một người dùng. Không có đường nào ghi ra ngoài bộ nhớ. */
function createStore() {
  let owner = null;
  let draft = emptyDraft();
  const forUser = (userId) => {
    if (owner !== userId) {
      owner = userId;
      draft = emptyDraft();
    }
    return draft;
  };
  return {
    get: (userId) => ({ ...forUser(userId) }),
    save(userId, fields) {
      Object.assign(forUser(userId), fields);
    },
    ensureKey(userId) {
      const current = forUser(userId);
      current.key ??= makeIdempotencyKey();
      return current.key;
    },
    clear() {
      owner = null;
      draft = emptyDraft();
    },
  };
}

/**
 * `CheckoutDraft` (D-157): ba trường nhận hàng và `idempotencyKey` sống khi người mua rời `/checkout` sang `/cart`
 * rồi quay lại (E5), để form không mất. Xóa khi đặt xong, đăng xuất, nhận 401 (người dùng đổi thành null) hoặc tải lại
 * trang (bộ nhớ). KHÔNG ghi `localStorage`, `sessionStorage`, URL, log (R9, AC-17): đây là dữ liệu cá nhân.
 */
export function CheckoutDraftProvider({ children }) {
  const { status, user } = useAuth();
  const userId = status === 'authenticated' && user?.role === 'user' ? user.id : null;
  const [store] = useState(createStore);

  // Hết phiên, đăng xuất: bỏ sạch, kể cả khi cùng người đăng nhập lại.
  useEffect(() => {
    if (!userId) store.clear();
  }, [userId, store]);

  const value = useMemo(
    () => ({
      get: () => store.get(userId),
      save: (fields) => store.save(userId, fields),
      ensureKey: () => store.ensureKey(userId),
      clear: () => store.clear(),
    }),
    [store, userId],
  );
  return <CheckoutDraftContext.Provider value={value}>{children}</CheckoutDraftContext.Provider>;
}
