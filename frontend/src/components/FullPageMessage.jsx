import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { Button } from './Button.jsx';
import { Spinner } from './Spinner.jsx';

/** Màn chờ khôi phục phiên: chỉ hiện nếu chờ > 300 ms để tránh nháy (header-navigation.md). */
export function FullPageLoader() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 300);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-canvas text-ink">
      {visible && (
        <div role="status" className="flex animate-toast-in flex-col items-center gap-3">
          <span className="font-display text-display font-semibold">Try-on</span>
          <Spinner size={24} label="" />
          <span className="text-small text-ink-muted">Đang tải…</span>
        </div>
      )}
    </div>
  );
}

/** Lỗi khôi phục phiên do mạng/5xx: giữ token, cho thử lại. */
export function ConnectionError({ onRetry, onSignInAgain }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas px-4 text-center text-ink">
      <WifiOff size={40} aria-hidden="true" className="text-ink-subtle" />
      <h1 className="font-display text-title font-semibold">Không thể kết nối</h1>
      <p className="text-body text-ink-muted">Vui lòng kiểm tra mạng và thử lại.</p>
      <Button onClick={onRetry}>Thử lại</Button>
      <button
        type="button"
        onClick={onSignInAgain}
        className="text-small font-semibold text-accent-strong underline hover:text-ink"
      >
        Đăng nhập lại
      </button>
    </div>
  );
}
