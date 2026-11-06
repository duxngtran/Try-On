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
