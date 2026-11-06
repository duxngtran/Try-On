import { useCallback, useEffect, useRef, useState } from 'react';
import { tryonApi } from './tryonApi.js';

/**
 * Giữ `GET /try-on/state` (điều kiện vào phòng, số lượt). `load({ silent })` làm mới mà không về skeleton và
 * trả dữ liệu mới (hoặc null nếu lỗi). `apply(data)` nhận state từ POST/DELETE /consent. Tab hiện lại thì làm
 * mới ngầm (screens/try-on-room.md, mục 2e).
 */
export function useTryOnState() {
  const [state, setState] = useState({ status: 'loading', data: null });
  const requestId = useRef(0);

  const load = useCallback(async ({ silent = false } = {}) => {
    const id = ++requestId.current;
    if (!silent) setState({ status: 'loading', data: null });
    try {
      const data = await tryonApi.getState();
      if (id !== requestId.current) return null;
      setState({ status: 'ready', data });
      return data;
    } catch (error) {
      if (id !== requestId.current || error.code === 'CANCELED') return null;
      if (!silent) setState({ status: 'error', data: null });
      return null;
    }
  }, []);

  const apply = useCallback((data) => {
    requestId.current += 1; // bỏ kết quả của request cũ còn bay
    setState({ status: 'ready', data });
  }, []);

  useEffect(() => {
    // Tải lần đầu khi vào trang; setState nằm trong callback bất đồng bộ của `load`.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') load({ silent: true });
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  return { ...state, load, apply };
}
