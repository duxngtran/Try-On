import { useCallback, useEffect, useState } from 'react';

/**
 * Đếm ngược theo mốc thời gian tuyệt đối (đúng cả khi tab ngủ), dùng cho 429 (screens/login.md).
 * `state`: 'idle' (chưa đếm) | 'running' | 'finished'.
 */
export function useCountdown() {
  const [deadline, setDeadline] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  const running = deadline !== null && now < deadline;

  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);

  const start = useCallback((seconds) => {
    const t = Date.now();
    setNow(t);
    setDeadline(t + seconds * 1000);
  }, []);
  const reset = useCallback(() => setDeadline(null), []);

  const remainingSeconds = running ? Math.ceil((deadline - now) / 1000) : 0;
  const state = deadline === null ? 'idle' : running ? 'running' : 'finished';
  return { state, remainingSeconds, start, reset };
}

/** 125 -> "02:05" */
export function formatMmSs(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
