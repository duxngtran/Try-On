import { Alert } from '../../components/Alert.jsx';
import { formatMmSs } from '../../hooks/useCountdown.js';

const NOTICES = {
  'session-expired': {
    variant: 'warning',
    message: 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.',
  },
  'signed-out': { variant: 'info', message: 'Bạn đã đăng xuất.' },
};

/** Thông báo ngữ cảnh từ `location.state.notice` (D-36); mã lạ thì không hiện gì. */
export function ContextNotice({ notice }) {
  const entry = NOTICES[notice];
  if (!entry) return null;
  return (
    <Alert variant={entry.variant} className="mb-4">
      {entry.message}
    </Alert>
  );
}

/**
 * Lỗi chung đầu form + trạng thái đếm ngược 429 (screens/login.md).
 * `general`: `{ variant, message }`; `countdown`: kết quả của `useCountdown`.
 */
export function GeneralStatus({ general, countdown, retryNoun = 'đăng nhập', onClose }) {
  if (countdown.state === 'finished') {
    return (
      <Alert variant="info" role="status" className="mb-4">
        Bạn có thể thử {retryNoun} lại.
      </Alert>
    );
  }
  if (!general) return null;
  const isRateLimit = general.variant === 'warning';
  return (
    <Alert
      variant={general.variant}
      role={isRateLimit ? 'status' : 'alert'}
      onClose={isRateLimit ? undefined : onClose}
      className="mb-4"
    >
      <p>{general.message}</p>
      {countdown.state === 'running' && (
        <p aria-hidden="true" className="mt-1 text-ink-muted">
          Có thể {retryNoun} lại sau{' '}
          <span className="tabular-nums font-semibold">
            {formatMmSs(countdown.remainingSeconds)}
          </span>
        </p>
      )}
    </Alert>
  );
}
