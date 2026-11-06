import { useEffect, useId, useRef } from 'react';
import { AlertCircle, Ban, Clock, Info, PackageX, UserRoundX } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '../../components/Button.jsx';
import { Spinner } from '../../components/Spinner.jsx';
import { useCountdown } from '../../hooks/useCountdown.js';
import { WAITING_TEXT } from './tryonStates.js';

const ICONS = {
  clock: Clock,
  alert: AlertCircle,
  ban: Ban,
  'user-x': UserRoundX,
  info: Info,
  'package-x': PackageX,
};
const STRIPE = {
  danger: 'border-l-danger text-danger',
  warning: 'border-l-warning text-warning',
  info: 'border-l-accent text-accent-strong',
};
/** Id của lớp phủ S14: nút Thêm vào giỏ trỏ `aria-describedby` vào đây, không lặp lại câu "không còn bán". */
export const STAGE_GONE_ID = 'stage-gone-body';
const CARD =
  'absolute inset-x-3 bottom-3 max-h-[45%] overflow-y-auto rounded-lg border border-line bg-surface px-4 py-3 shadow-card';

/**
 * Lớp phủ chờ (gọn): Spinner + một hoặc hai dòng. Không có nút. `focusRequest.current` là true khi người mua
 * vừa bấm Thử lại / Kiểm tra lại: nút đó biến mất nên focus chuyển vào khối chờ này (try-on-room.md).
 */
export function WaitOverlay({ phase, long, focusRequest }) {
  const ref = useRef(null);
  useEffect(() => {
    if (focusRequest?.current) {
      ref.current?.focus();
      focusRequest.current = false;
    }
  }, [focusRequest]);
  return (
    <div ref={ref} tabIndex={-1} className={`${CARD} focus:outline-none`}>
      <div className="flex items-start gap-3 text-small">
        <span className="mt-0.5 flex shrink-0">
          <Spinner size={20} label="" />
        </span>
        <div className="min-w-0">
          <p>{phase === 'resolving' ? WAITING_TEXT.resolving : WAITING_TEXT.waiting}</p>
          {phase === 'waiting' && long && (
            <p className="mt-1 text-ink-muted">{WAITING_TEXT.waitingLong}</p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Nút có đếm ngược (S10c, S11): khóa mềm bằng aria-disabled, đọc lý do qua aria-describedby. */
function LockedAction({ action, describedBy, onClick }) {
  const countdown = useCountdown();
  const { start } = countdown;
  useEffect(() => {
    start(action.lockSeconds);
  }, [start, action.lockSeconds]);
  const locked = countdown.state === 'running';
  return (
    <>
      <Button
        softDisabled={locked}
        onClick={onClick}
        aria-describedby={locked ? describedBy : undefined}
        className="w-full sm:w-auto"
      >
        {locked ? `${action.label} sau ${countdown.remainingSeconds} giây` : action.label}
      </Button>
      {/* Chỉ đọc khi kết thúc: các giây trôi qua không được đọc (design-system 8.8). */}
      <span role="status" className="sr-only">
        {countdown.state === 'finished' ? 'Bạn có thể thử lại.' : ''}
      </span>
    </>
  );
}

/**
 * Lớp phủ thông báo/lỗi trong khung (try-on-states.md mục 1). `overlay` là kết quả của `describeOverlay`.
 * `onAction(kind)` xử lý retry/recheck/reload/otherCategory; `profile` là liên kết tới `/profile#photo`.
 */
export function MessageOverlay({ overlay, onAction }) {
  const bodyId = useId();
  const Icon = ICONS[overlay.icon] ?? Info;
  const { action } = overlay;
  let control = null;
  if (action?.kind === 'profile') {
    control = (
      <Link
        to="/profile#photo"
        className="inline-flex h-11 w-full items-center justify-center rounded-md bg-ink px-5 text-small font-semibold text-ink-inverse hover:bg-[#333] sm:w-auto"
      >
        {action.label}
      </Link>
    );
  } else if (action?.lockSeconds) {
    control = (
      <LockedAction
        key={overlay.id}
        action={action}
        describedBy={bodyId}
        onClick={() => onAction(action.kind)}
      />
    );
  } else if (action) {
    control = (
      <Button
        variant={
          action.kind === 'recheck' || action.kind === 'otherCategory' ? 'secondary' : 'primary'
        }
        onClick={() => onAction(action.kind)}
        className="w-full sm:w-auto"
      >
        {action.label}
      </Button>
    );
  }
  return (
    <div role={overlay.role} className={`${CARD} border-l-4 ${STRIPE[overlay.variant]}`}>
      <div className="flex items-start gap-3 text-small text-ink">
        <Icon size={20} aria-hidden="true" className="mt-0.5 shrink-0" />
        <div id={overlay.id === 'deleted' ? STAGE_GONE_ID : bodyId} className="min-w-0">
          {overlay.title && <p className="font-semibold">{overlay.title}</p>}
          <p>{overlay.body}</p>
          {overlay.detail && <p className="mt-1 text-ink-muted">{overlay.detail}</p>}
        </div>
      </div>
      {control && <div className="mt-3 flex">{control}</div>}
    </div>
  );
}
