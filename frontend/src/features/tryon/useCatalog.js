import { useCallback, useEffect, useRef, useState } from 'react';
import { tryonApi } from './tryonApi.js';

/**
 * Danh sách danh mục có sản phẩm (D-73), giữ thứ tự của server (D-44). `reload({ silent })` giữ nguyên danh
 * sách đang hiển thị và trả danh sách mới (hoặc null nếu lỗi).
 */
export function useCategories() {
  const [state, setState] = useState({ status: 'loading', categories: [] });
  const requestId = useRef(0);

  const reload = useCallback(async ({ silent = false } = {}) => {
    const id = ++requestId.current;
    if (!silent) setState({ status: 'loading', categories: [] });
    try {
      const categories = await tryonApi.getCategories();
      if (id !== requestId.current) return null;
      setState({ status: 'ready', categories });
      return categories;
    } catch (error) {
      if (id !== requestId.current || error.code === 'CANCELED') return null;
      if (!silent) setState({ status: 'error', categories: [] });
      return null;
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
  }, [reload]);

  return { ...state, reload };
}

/**
 * Sản phẩm đầu tiên của danh mục (D-44, AC-05): `status` là `idle` (chưa chọn, D-72), `loading`, `ready`,
 * `empty` (E6), `gone` (404, E7) hoặc `error`. Đổi danh mục thì bỏ kết quả của danh mục cũ.
 */
export function useFirstProduct(categoryId) {
  const [result, setResult] = useState({ categoryId: null, status: 'idle', product: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!categoryId) return undefined;
    const controller = new AbortController();
    (async () => {
      try {
        const data = await tryonApi.getProducts(categoryId, { signal: controller.signal });
        if (controller.signal.aborted) return;
        const [first] = data.items;
        setResult({
          categoryId,
          status: first ? 'ready' : 'empty',
          product: first ?? null,
          total: data.total,
        });
      } catch (error) {
        if (controller.signal.aborted || error.code === 'CANCELED') return;
        setResult({
          categoryId,
          status: error.status === 404 ? 'gone' : 'error',
          product: null,
        });
      }
    })();
    return () => controller.abort();
  }, [categoryId, attempt]);

  const retry = useCallback(() => {
    setResult({ categoryId: null, status: 'idle', product: null });
    setAttempt((n) => n + 1);
  }, []);

  if (!categoryId) return { status: 'idle', product: null, retry };
  if (result.categoryId !== categoryId) return { status: 'loading', product: null, retry };
  return { status: result.status, product: result.product, total: result.total, retry };
}
