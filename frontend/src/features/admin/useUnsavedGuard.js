import { useCallback, useEffect, useRef } from 'react';
import { useBlocker } from 'react-router';

/**
 * Cảnh báo rời form chưa lưu (D-60): chặn điều hướng trong app bằng `useBlocker` (cần data router) và
 * chặn đóng tab/tải lại bằng `beforeunload`.
 * @param {boolean} active có thay đổi chưa lưu hoặc đang lưu
 * @returns {{ blocker: import('react-router').Blocker, allowNext: () => void }}
 *   `allowNext()` gọi ngay trước khi tự điều hướng (sau lưu thành công, 404) để không bị hỏi.
 */
export function useUnsavedGuard(active) {
  const activeRef = useRef(active);
  const bypassRef = useRef(false);
  useEffect(() => {
    activeRef.current = active;
  });

  const shouldBlock = useCallback(() => activeRef.current && !bypassRef.current, []);
  const blocker = useBlocker(shouldBlock);

  useEffect(() => {
    if (!active) return undefined;
    const warn = (event) => {
      if (bypassRef.current) return;
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [active]);

  const allowNext = useCallback(() => {
    bypassRef.current = true;
  }, []);
  return { blocker, allowNext };
}
