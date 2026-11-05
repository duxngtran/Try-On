import { useCallback, useEffect, useRef, useState } from 'react';
import { categoriesApi } from './categoriesApi.js';

/**
 * Danh sách danh mục cho trang quản trị. Giữ nguyên thứ tự server trả (D-44).
 * `status`: 'loading' (lần đầu) | 'ready' | 'error' (lần đầu thất bại).
 * `refreshFailed`: làm mới ngầm thất bại sau khi đã có dữ liệu (giữ danh sách cũ).
 */
export function useCategories() {
  const [state, setState] = useState({ status: 'loading', categories: [], refreshFailed: false });
  const [attempt, setAttempt] = useState(0);
  const seq = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const mine = (seq.current += 1);
    categoriesApi
      .list({ signal: controller.signal })
      .then((categories) => {
        if (mine === seq.current) setState({ status: 'ready', categories, refreshFailed: false });
      })
      .catch((error) => {
        if (mine !== seq.current || error?.code === 'CANCELED') return;
        // Đã có dữ liệu thì giữ lại, chỉ báo làm mới lỗi.
        setState((prev) =>
          prev.status === 'ready' ? { ...prev, refreshFailed: true } : { ...prev, status: 'error' },
        );
      });
    return () => controller.abort();
  }, [attempt]);

  /** Tải lại. `silent`: không đổi về trạng thái loading (giữ danh sách cũ). */
  const reload = useCallback(({ silent = true } = {}) => {
    if (!silent) setState((prev) => ({ ...prev, status: 'loading', refreshFailed: false }));
    setAttempt((n) => n + 1);
  }, []);

  /** Cập nhật cục bộ ngay sau khi ghi thành công, trước khi lần tải lại ngầm về. */
  const apply = useCallback((update) => {
    setState((prev) => ({ ...prev, categories: update(prev.categories) }));
  }, []);

  return { ...state, reload, apply };
}
