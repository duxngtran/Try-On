import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/authContext.js';
import { profileApi } from './profileApi.js';

const REFRESH_BEFORE_EXPIRY_MS = 60_000;
const MIN_REFRESH_DELAY_MS = 5_000;
const MAX_TIMER_MS = 2 ** 31 - 1; // setTimeout lớn hơn mức này chạy ngay lập tức

/**
 * Tải và giữ hồ sơ (profile-get.md). Mọi response thành công của API hồ sơ là `{ profile }` đầy đủ nên
 * chỉ cần một reducer `applyProfile`; `profileCompleted` luôn được đẩy sang AuthProvider.
 *
 * `reload({ silent })` giữ nguyên dữ liệu đang hiển thị (không về skeleton), dùng cho làm mới signed URL
 * và khi quay lại tab. Lỗi của lần làm mới ngầm bị bỏ qua để không phá giao diện đang dùng được.
 */
export function useProfile() {
  const { setProfileCompleted } = useAuth();
  const [state, setState] = useState({ status: 'loading', profile: null, error: null });
  const requestId = useRef(0);

  const applyProfile = useCallback(
    (profile) => {
      requestId.current += 1; // bỏ kết quả của request cũ còn bay
      setState({ status: 'ready', profile, error: null });
      setProfileCompleted(profile.profileCompleted);
    },
    [setProfileCompleted],
  );

  const reload = useCallback(
    async ({ silent = false } = {}) => {
      const id = ++requestId.current;
      if (!silent) setState((prev) => ({ ...prev, status: 'loading', error: null }));
      try {
        const profile = await profileApi.get();
        if (id !== requestId.current) return;
        setState({ status: 'ready', profile, error: null });
        setProfileCompleted(profile.profileCompleted);
      } catch (error) {
        if (id !== requestId.current || error.code === 'CANCELED') return;
        if (silent) return;
        setState({ status: 'error', profile: null, error });
      }
    },
    [setProfileCompleted],
  );

  useEffect(() => {
    // Tải lần đầu khi vào trang; setState nằm trong callback bất đồng bộ của `reload`.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
  }, [reload]);

  // Quay lại tab: làm mới nền (signed URL có thể đã hết hạn khi tab ngủ).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') reload({ silent: true });
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [reload]);

  // Làm mới ngầm trước khi signed URL hết hạn (~60 giây) khi trang còn mở.
  const expiresAt = state.profile?.photo?.expiresAt;
  useEffect(() => {
    if (!expiresAt) return undefined;
    const delay = Math.min(
      Math.max(Date.parse(expiresAt) - Date.now() - REFRESH_BEFORE_EXPIRY_MS, MIN_REFRESH_DELAY_MS),
      MAX_TIMER_MS,
    );
    const timer = setTimeout(() => reload({ silent: true }), delay);
    return () => clearTimeout(timer);
  }, [expiresAt, reload]);

  return { ...state, reload, applyProfile };
}
