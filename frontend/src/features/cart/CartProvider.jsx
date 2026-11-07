import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { useAuth } from '../auth/authContext.js';
import { cartApi } from './cartApi.js';
import { CartContext } from './cartContext.js';
import { describeAdded, describeLateError } from './cartMessages.js';

const SUCCESS_MS = 4000;
const ERROR_MS = 6000;
// Sau các lỗi này giỏ ở server khác với giỏ đang biết: đọc lại một lần.
const REFRESH_AFTER = new Set(['CART_QUANTITY_LIMIT', 'CART_FULL', 'NOT_FOUND']);

/**
 * Giữ giỏ trong bộ nhớ (US-07, D-141). Đặt trong `AuthProvider`, ngoài `Layout` và `ProductStage`, nên đổi sản phẩm
 * hay chuyển trang không hủy request đang chạy và không mất thông báo (flows/cart-add.md).
 *
 * - Chỉ role `user` có giỏ: tải `GET /cart` một lần khi đăng nhập; đăng xuất hoặc hết phiên thì bỏ sạch dữ liệu.
 * - Mỗi sản phẩm một khóa: bấm đúp chỉ gửi một request, sản phẩm khác vẫn thêm được ngay.
 * - Số trên giỏ chỉ đổi theo response, không cập nhật lạc quan. Nhiều request chồng nhau thì khi hết request
 *   đọc lại một lần, vì response có thể về khác thứ tự gửi.
 * - Không tự gửi lại khi lỗi: `POST` không idempotent (R3).
 */
export function CartProvider({ children }) {
  const { status: authStatus, user } = useAuth();
  const userId = authStatus === 'authenticated' && user?.role === 'user' ? user.id : null;
  // Ở /checkout không làm mới ngầm: người mua không được xác nhận một giỏ họ chưa xem (D-144, D-158).
  const { pathname } = useLocation();
  const pathnameRef = useRef(pathname);
  useLayoutEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  // Dữ liệu gắn với userId để đổi tài khoản không lộ giỏ cũ dù một render.
  const [store, setStore] = useState({ userId: null, cart: null });
  const [pendingIds, setPendingIds] = useState(() => new Set());
  const [notice, setNotice] = useState(null);

  const generation = useRef(0); // đổi mỗi khi đổi người dùng: bỏ kết quả của phiên cũ
  const userIdRef = useRef(userId);
  const pendingRef = useRef(new Set());
  const inflight = useRef(0);
  const overlapped = useRef(false);
  const requestSeq = useRef(0);
  const appliedSeq = useRef(0);
  const noticeTimer = useRef(null);
  const refreshController = useRef(null);

  const showNotice = useCallback((kind, message) => {
    clearTimeout(noticeTimer.current);
    setNotice({ id: Date.now() + Math.random(), kind, message });
    noticeTimer.current = setTimeout(
      () => setNotice(null),
      kind === 'error' ? ERROR_MS : SUCCESS_MS,
    );
  }, []);

  /** Nhận giỏ từ một response; response của request bắt đầu sớm hơn lần đã nhận gần nhất bị bỏ. */
  const apply = useCallback((cart, seq, forGeneration) => {
    if (forGeneration !== generation.current || seq <= appliedSeq.current) return;
    appliedSeq.current = seq;
    setStore({ userId: userIdRef.current, cart, failed: false });
  }, []);

  /** Đọc lại giỏ. Trả giỏ mới nhất đã nhận, hoặc `null` khi lỗi/bị thay thế bởi lần đọc khác. */
  const refresh = useCallback(async () => {
    if (!userIdRef.current) return null;
    const forGeneration = generation.current;
    const seq = (requestSeq.current += 1);
    refreshController.current?.abort();
    const controller = new AbortController();
    refreshController.current = controller;
    try {
      const cart = await cartApi.getCart({ signal: controller.signal });
      apply(cart, seq, forGeneration);
      return forGeneration === generation.current ? cart : null;
    } catch (error) {
      if (error.code === 'CANCELED' || forGeneration !== generation.current) return null;
      // Lỗi tải không báo ở header (entry-points.md): chỉ ghi nhận để hiện icon không số.
      setStore((prev) =>
        prev.cart ? prev : { userId: userIdRef.current, cart: null, failed: true },
      );
      return null;
    }
  }, [apply]);

  useEffect(() => {
    userIdRef.current = userId;
    generation.current += 1;
    appliedSeq.current = requestSeq.current;
    refreshController.current?.abort();
    clearTimeout(noticeTimer.current);
    if (!userId) return undefined;
    refresh();
    return () => refreshController.current?.abort();
  }, [userId, refresh]);

  // Tab hiển thị lại: làm mới ngầm số trên header (entry-points.md mục 1).
  useEffect(() => {
    if (!userId) return undefined;
    const onVisible = () => {
      if (document.visibilityState === 'visible' && pathnameRef.current !== '/checkout') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [userId, refresh]);

  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  const isAdding = useCallback((productId) => pendingIds.has(productId), [pendingIds]);

  const addItem = useCallback(
    async ({ productId, name, priceVnd, isShown = () => false }) => {
      // `productId`, tên và giá là của sản phẩm tại lúc bấm (R2): đổi sản phẩm sau đó không đổi mục tiêu.
      if (!userIdRef.current || pendingRef.current.has(productId)) {
        return { ok: false, skipped: true };
      }
      const forGeneration = generation.current;
      pendingRef.current.add(productId);
      setPendingIds(new Set(pendingRef.current));
      if (inflight.current > 0) overlapped.current = true;
      inflight.current += 1;
      const seq = (requestSeq.current += 1);

      let outcome;
      try {
        const cart = await cartApi.addItem(productId);
        apply(cart, seq, forGeneration);
        if (forGeneration === generation.current) {
          const line = cart.items.find((item) => item.productId === productId);
          showNotice(
            'success',
            describeAdded({ name, priceAtClick: priceVnd, priceNow: line?.priceVnd }),
          );
        }
        outcome = { ok: true };
      } catch (error) {
        outcome = { ok: false, code: error.code, details: error.details };
        // Người mua đã rời sản phẩm: Alert gắn với nút đã gỡ, nên báo bằng thông báo cấp Layout.
        if (forGeneration === generation.current && !isShown()) {
          showNotice('error', describeLateError(outcome, name));
        }
        if (REFRESH_AFTER.has(error.code)) overlapped.current = true;
      } finally {
        pendingRef.current.delete(productId);
        setPendingIds(new Set(pendingRef.current));
        inflight.current -= 1;
        if (inflight.current === 0 && overlapped.current) {
          overlapped.current = false;
          refresh();
        }
      }
      return outcome;
    },
    [apply, refresh, showNotice],
  );

  /**
   * Đổi số lượng tuyệt đối (`PATCH`) hoặc bỏ dòng (`DELETE`), khóa theo từng dòng cùng với `addItem`.
   * Giỏ chỉ đổi theo response, không tự tính tổng, không cập nhật lạc quan. Trả `{ ok, cart? , code?, details? }`.
   * Sau NOT_FOUND, giỏ ở server khác giỏ đang biết: đọc lại một lần và trả giỏ đó ở `cart`.
   */
  const mutateLine = useCallback(
    async (productId, call) => {
      if (!userIdRef.current || pendingRef.current.has(productId)) {
        return { ok: false, skipped: true };
      }
      const forGeneration = generation.current;
      pendingRef.current.add(productId);
      setPendingIds(new Set(pendingRef.current));
      const seq = (requestSeq.current += 1);
      try {
        const next = await call();
        apply(next, seq, forGeneration);
        return { ok: true, cart: next };
      } catch (error) {
        const outcome = { ok: false, code: error.code, details: error.details };
        if (error.code === 'NOT_FOUND') outcome.cart = await refresh();
        return outcome;
      } finally {
        pendingRef.current.delete(productId);
        setPendingIds(new Set(pendingRef.current));
      }
    },
    [apply, refresh],
  );

  const setQuantity = useCallback(
    (productId, quantity) => mutateLine(productId, () => cartApi.setQuantity(productId, quantity)),
    [mutateLine],
  );
  const removeItem = useCallback(
    (productId) => mutateLine(productId, () => cartApi.removeItem(productId)),
    [mutateLine],
  );

  const cart = store.userId === userId ? store.cart : null;
  let status = 'idle';
  if (userId) {
    if (store.userId !== userId) status = 'loading';
    else status = cart ? 'ready' : store.failed ? 'error' : 'loading';
  }

  const value = useMemo(
    () => ({
      cart,
      status,
      isAdding,
      isLineBusy: isAdding,
      addItem,
      setQuantity,
      removeItem,
      refresh,
      notice: userId ? notice : null,
    }),
    [cart, status, isAdding, addItem, setQuantity, removeItem, refresh, notice, userId],
  );
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
