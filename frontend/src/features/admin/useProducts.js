import { useCallback, useEffect, useRef, useState } from 'react';
import { productsApi } from './productsApi.js';

/**
 * Danh sách sản phẩm theo `{ page, categoryId }` (screens/products.md). Giữ dòng cũ khi đổi trang/lọc
 * hoặc khi tải lại lỗi (không dùng skeleton để tránh nhấp nháy).
 * - `status`: 'loading' (lần đầu, chưa có dữ liệu) | 'error' (lần đầu lỗi) | 'ready'.
 * - `fetching`: đang tải dữ liệu cho tham số hiện tại trong khi vẫn hiện dòng cũ.
 * - `settled`: `data` đúng là của tham số hiện tại (dùng để quyết định lùi trang).
 * - `error`: lỗi của lần tải gần nhất (ApiError) hoặc null.
 */
export function useProducts({ page, categoryId }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ key: null, data: null, error: null });
  const key = `${page}|${categoryId ?? ''}|${attempt}`;
  const seq = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const mine = (seq.current += 1);
    productsApi
      .list({ page, categoryId, signal: controller.signal })
      .then((data) => {
        if (mine === seq.current) setState({ key, data, error: null });
      })
      .catch((error) => {
        if (mine !== seq.current || error?.code === 'CANCELED') return;
        setState((prev) => ({ ...prev, key, error }));
      });
    return () => controller.abort();
  }, [page, categoryId, key]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  /** Bỏ một dòng ngay sau khi xóa thành công, trước khi lần tải lại về. */
  const removeLocal = useCallback((id) => {
    setState((prev) =>
      prev.data
        ? {
            ...prev,
            data: {
              ...prev.data,
              items: prev.data.items.filter((p) => p.id !== id),
              pagination: {
                ...prev.data.pagination,
                total: Math.max(0, prev.data.pagination.total - 1),
              },
            },
          }
        : prev,
    );
  }, []);

  const current = state.key === key;
  const hasData = state.data !== null;
  let status = 'ready';
  if (!hasData) status = current && state.error ? 'error' : 'loading';

  return {
    status,
    data: state.data,
    error: current ? state.error : null,
    fetching: !current,
    settled: current && state.error === null,
    reload,
    removeLocal,
  };
}
