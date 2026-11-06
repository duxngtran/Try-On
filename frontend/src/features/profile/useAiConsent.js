import { useCallback, useEffect, useRef, useState } from 'react';
import { tryonApi } from '../tryon/tryonApi.js';

/**
 * Trạng thái consent gửi ảnh cho dịch vụ AI (D-93), lấy từ `GET /try-on/state` độc lập với `GET /profile`
 * (api.md mục 8: hai consent khác mục đích không gộp vào API hồ sơ). Chỉ dùng `consent`.
 * Gọi lại mỗi lần vào trang để số liệu không cũ.
 */
export function useAiConsent() {
  const [state, setState] = useState({ status: 'loading', consent: null });
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setState({ status: 'loading', consent: null });
    try {
      const data = await tryonApi.getState();
      if (id === requestId.current) setState({ status: 'ready', consent: data.consent });
    } catch (error) {
      if (id === requestId.current && error.code !== 'CANCELED') {
        setState({ status: 'error', consent: null });
      }
    }
  }, []);

  /** Nhận `/state` từ `DELETE /try-on/consent`. */
  const apply = useCallback((data) => {
    requestId.current += 1;
    setState({ status: 'ready', consent: data.consent });
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  return { ...state, load, apply };
}

/** Đã từng gửi ảnh đi? Chưa đọc được state thì coi là có (an toàn hơn: luôn nói "không thu hồi được"). */
export function hasEverConsented({ status, consent } = {}) {
  if (status !== 'ready') return true;
  return consent.acceptedAt != null || consent.withdrawnAt != null;
}
