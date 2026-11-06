import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { tryonApi } from './tryonApi.js';

const IDLE = { categoryId: null, status: 'idle' };
const PAGE_AHEAD = 3; // tải trước trang kế khi còn cách cuối <= 3 sản phẩm (try-on-room.md, mũi tên)

const isCanceled = (error) => error?.code === 'CANCELED';

/** Gộp thêm `incoming` vào `items` theo đúng chiều, bỏ trùng id (con trỏ không lặp, nhưng phòng hờ). */
function mergeItems(items, incoming, direction) {
  const known = new Set(items.map((item) => item.id));
  const fresh = incoming.filter((item) => !known.has(item.id));
  return direction === 'next' ? [...items, ...fresh] : [...fresh, ...items];
}

/** Dựng trạng thái từ trang đầu tiên của một danh mục (hoặc trang bắt đầu từ `at`). */
function fromFirstPage(categoryId, data, at) {
  const base = {
    categoryId,
    status: 'ready',
    items: data.items,
    prevCursor: data.prevCursor ?? null,
    nextCursor: data.nextCursor ?? null,
    total: data.total,
    currentId: null,
    goneId: null,
    moving: null,
    navError: null,
  };
  if (data.items.length === 0) {
    // Danh mục trống (E6) hoặc sản phẩm trên URL đã xóa và không còn sản phẩm nào sau nó.
    return data.total === 0 || !at
      ? { ...base, status: 'empty' }
      : { ...base, goneId: at, nextCursor: null };
  }
  if (at && data.anchor?.deleted) return { ...base, goneId: at }; // US-06 E3: báo, không tự chuyển
  return { ...base, currentId: data.items[0].id };
}

/**
 * Điều hướng giữa các sản phẩm của một danh mục theo con trỏ cả hai chiều (US-06 R1, R2, AC-11, AC-17).
 * Danh sách chỉ nhận thêm trang ở hai đầu; sản phẩm thêm hoặc xóa trong lúc xem không làm vị trí nhảy.
 * Khi mở bằng URL có `product` thì tải từ `?at=` (R8). `status`: `idle`, `loading`, `ready`, `empty`, `gone`, `error`.
 */
export function useProductNavigation(categoryId, productParam) {
  const [state, setState] = useState(IDLE);
  const [attempt, setAttempt] = useState(0);
  const stateRef = useRef(state);
  const productParamRef = useRef(productParam);
  const inflight = useRef({ next: false, prev: false });
  const moveOnLoad = useRef({ next: false, prev: false });
  const failedCursor = useRef({ next: null, prev: null });
  const generation = useRef(0); // tăng mỗi lần đổi danh mục, bỏ kết quả của danh mục cũ

  // Layout effect: nút vừa hiện là bấm được, `useEffect` chạy muộn hơn nên cú bấm đầu có thể đọc state cũ và bị bỏ.
  useLayoutEffect(() => {
    stateRef.current = state;
    productParamRef.current = productParam;
  });

  useEffect(() => {
    if (!categoryId) return undefined;
    generation.current += 1;
    inflight.current = { next: false, prev: false };
    moveOnLoad.current = { next: false, prev: false };
    failedCursor.current = { next: null, prev: null };
    const controller = new AbortController();
    let at = productParamRef.current || undefined;
    (async () => {
      try {
        let data;
        try {
          data = await tryonApi.getProducts(categoryId, { at, signal: controller.signal });
        } catch (error) {
          // Tham số product trên URL hỏng định dạng (400): bỏ qua và mở trang đầu, không báo lỗi.
          if (!at || error.status !== 400) throw error;
          data = await tryonApi.getProducts(categoryId, { signal: controller.signal });
          at = undefined;
        }
        if (controller.signal.aborted) return;
        setState(fromFirstPage(categoryId, data, at));
      } catch (error) {
        if (controller.signal.aborted || isCanceled(error)) return;
        setState({ categoryId, status: error.status === 404 ? 'gone' : 'error' });
      }
    })();
    return () => controller.abort();
  }, [categoryId, attempt]);

  const markFailure = useCallback((direction) => {
    setState((s) => (s.status === 'ready' ? { ...s, moving: null, navError: direction } : s));
  }, []);

  /** Khôi phục một lần khi con trỏ bị từ chối (400): tải lại từ sản phẩm đang xem bằng `?at=`. */
  const recover = useCallback(
    async (gen) => {
      const s = stateRef.current;
      const id = s.currentId ?? s.goneId;
      const data = await tryonApi.getProducts(s.categoryId, { at: id });
      if (gen !== generation.current) return null;
      const fresh = fromFirstPage(s.categoryId, data, id);
      setState((cur) => (cur.categoryId === s.categoryId ? { ...fresh, currentId: id } : cur));
      return fresh;
    },
    [setState],
  );

  const loadMore = useCallback(
    async (direction, { move = false } = {}) => {
      const s = stateRef.current;
      if (s.status !== 'ready') return;
      const cursor = direction === 'next' ? s.nextCursor : s.prevCursor;
      if (!cursor) return;
      if (move) {
        moveOnLoad.current[direction] = true;
        failedCursor.current[direction] = null;
        setState((cur) =>
          cur.status === 'ready' ? { ...cur, moving: direction, navError: null } : cur,
        );
      } else if (failedCursor.current[direction] === cursor) {
        return; // đã lỗi với con trỏ này: chờ người mua bấm Thử lại, không lặp vô hạn
      }
      if (inflight.current[direction]) return;
      inflight.current[direction] = true;
      const gen = generation.current;
      try {
        const params = direction === 'next' ? { after: cursor } : { before: cursor };
        const data = await tryonApi.getProducts(s.categoryId, params);
        if (gen !== generation.current) return;
        // Đọc cờ trước: updater của setState chạy sau `finally`, khi cờ đã bị xóa.
        const shouldMove = moveOnLoad.current[direction];
        setState((cur) => {
          if (cur.status !== 'ready' || cur.categoryId !== s.categoryId) return cur;
          if (data.items.length === 0 && data.total === 0) return { ...cur, status: 'empty' };
          const items = mergeItems(cur.items, data.items, direction);
          const next = {
            ...cur,
            items,
            total: data.total,
            moving: null,
            ...(direction === 'next'
              ? { nextCursor: data.nextCursor ?? null }
              : { prevCursor: data.prevCursor ?? null }),
          };
          if (shouldMove && data.items.length > 0) {
            const target = direction === 'next' ? data.items[0] : data.items.at(-1);
            next.currentId = target.id;
          }
          return next;
        });
      } catch (error) {
        if (gen !== generation.current || isCanceled(error)) return;
        if (error.status === 404) {
          setState((cur) => ({ categoryId: cur.categoryId, status: 'gone' }));
        } else if (error.status === 400 && !move) {
          // Con trỏ hỏng: bỏ qua im lặng, lần bấm kế tiếp sẽ khôi phục.
          failedCursor.current[direction] = cursor;
        } else if (error.status === 400) {
          try {
            await recover(gen);
          } catch {
            markFailure(direction);
          }
        } else if (move) {
          failedCursor.current[direction] = cursor;
          markFailure(direction);
        } else {
          failedCursor.current[direction] = cursor;
        }
      } finally {
        inflight.current[direction] = false;
        if (gen === generation.current) {
          moveOnLoad.current[direction] = false;
          setState((cur) => (cur.moving === direction ? { ...cur, moving: null } : cur));
        }
      }
    },
    [markFailure, recover],
  );

  const step = useCallback(
    (direction) => {
      const s = stateRef.current;
      if (s.status !== 'ready' || s.currentId == null) return;
      const index = s.items.findIndex((item) => item.id === s.currentId);
      const target = s.items[index + (direction === 'next' ? 1 : -1)];
      if (target) {
        setState((cur) => ({ ...cur, currentId: target.id, navError: null }));
        return;
      }
      loadMore(direction, { move: true });
    },
    [loadMore],
  );

  // Tải trước trang kế (hoặc trang trước) khi người mua sắp tới đầu hoặc cuối danh sách đã tải.
  const { status, currentId, items, nextCursor, prevCursor } = state;
  useEffect(() => {
    if (status !== 'ready' || currentId == null) return;
    const index = items.findIndex((item) => item.id === currentId);
    // `loadMore` không đặt state đồng bộ khi tải nền (chỉ sau await), nên không gây render dây chuyền.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (nextCursor && items.length - 1 - index <= PAGE_AHEAD) loadMore('next');
    if (prevCursor && index <= 1) loadMore('prev');
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [status, currentId, items, nextCursor, prevCursor, loadMore]);

  const retry = useCallback(() => {
    setState(IDLE);
    setAttempt((n) => n + 1);
  }, []);

  /** Thử lại điều hướng đang lỗi (S15). */
  const retryNav = useCallback(() => {
    const direction = stateRef.current.navError;
    if (!direction) return;
    failedCursor.current[direction] = null;
    step(direction);
  }, [step]);

  /** Sản phẩm đang xem bị xóa (S14): lấy sản phẩm kế tiếp theo con trỏ, đồng thời làm mới danh sách. */
  const skipGone = useCallback(async () => {
    const s = stateRef.current;
    const id = s.currentId ?? s.goneId;
    if (s.status !== 'ready' || !id) return false;
    const gen = generation.current;
    try {
      const data = await tryonApi.getProducts(s.categoryId, { at: id });
      if (gen !== generation.current) return false;
      const target = data.items.find((item) => item.id !== id);
      setState((cur) => {
        if (cur.categoryId !== s.categoryId) return cur;
        if (data.items.length === 0 && data.total === 0) return { ...cur, status: 'empty' };
        if (!target) {
          // Không còn gì sau sản phẩm này: giữ nó trên màn hình, mũi tên Sau tắt.
          const index = cur.items.findIndex((item) => item.id === id);
          const kept = index === -1 ? [] : cur.items.slice(0, index + 1);
          return { ...cur, items: kept, nextCursor: null, total: data.total };
        }
        return {
          ...cur,
          items: data.items,
          prevCursor: data.prevCursor ?? null,
          nextCursor: data.nextCursor ?? null,
          total: data.total,
          currentId: target.id,
          goneId: null,
          navError: null,
        };
      });
      return Boolean(target);
    } catch (error) {
      if (error?.status === 404) setState({ categoryId: s.categoryId, status: 'gone' });
      return false;
    }
  }, []);

  /** Chọn lại danh mục đang chọn: về sản phẩm đầu. Không gọi lại API nếu trang đầu đang có sẵn. */
  const goFirst = useCallback(() => {
    const s = stateRef.current;
    if (s.status === 'ready' && s.prevCursor === null && s.items[0]) {
      setState((cur) => ({ ...cur, currentId: cur.items[0].id, goneId: null, navError: null }));
    } else {
      productParamRef.current = null;
      retry();
    }
  }, [retry]);

  if (!categoryId) return { status: 'idle', product: null, retry };
  if (state.categoryId !== categoryId) return { status: 'loading', product: null, retry };
  if (state.status !== 'ready') return { status: state.status, product: null, retry };

  const index = state.items.findIndex((item) => item.id === state.currentId);
  const product = index === -1 ? null : state.items[index];
  const hasNext = index !== -1 && (index + 1 < state.items.length || Boolean(state.nextCursor));
  const hasPrev = index !== -1 && (index > 0 || Boolean(state.prevCursor));
  return {
    status: 'ready',
    product,
    goneId: product ? null : state.goneId,
    hasNextAfterGone: state.items.length > 0,
    total: state.total,
    position: product?.position ?? null,
    hasPrev,
    hasNext,
    moving: state.moving,
    navError: state.navError,
    prevProduct: index > 0 ? state.items[index - 1] : null,
    nextProduct: index !== -1 ? (state.items[index + 1] ?? null) : null,
    next: () => step('next'),
    prev: () => step('prev'),
    retry,
    retryNav,
    skipGone,
    goFirst,
  };
}
