import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { CheckCircle2, Undo2 } from 'lucide-react';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { Modal } from '../../components/Modal.jsx';
import { useCountdown } from '../../hooks/useCountdown.js';
import { tryonApi } from '../tryon/tryonApi.js';
import { DEFAULT_RETRY_SECONDS, TRYON_PROVIDER } from '../tryon/tryonConfig.js';
import { formatDateVn } from '../tryon/tryonFormat.js';

const WITHDRAW_FAILED = 'Chưa rút được đồng ý, vui lòng thử lại.';
const TOO_FAST = 'Bạn thao tác quá nhanh, vui lòng thử lại sau.';

function Badge({ tone, icon: Icon, children }) {
  const tones = {
    success: 'bg-success-soft text-success',
    warning: 'bg-warning-soft text-warning',
    neutral: 'bg-surface-muted text-ink-muted',
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-small font-semibold ${tones[tone]}`}
    >
      {Icon && <Icon size={16} aria-hidden="true" />}
      {children}
    </span>
  );
}

const TO_ROOM = (
  <Link to="/try-on" className="font-semibold text-accent-strong underline hover:text-ink">
    Vào phòng thử đồ
  </Link>
);

/** Trạng thái hiển thị từ `consent` của `/try-on/state` (profile-updates.md mục 5, bảng Trạng thái). */
function describeConsent(consent) {
  if (consent.accepted) {
    return {
      badge: { tone: 'success', icon: CheckCircle2, text: 'Đã đồng ý' },
      text: `Từ ngày ${formatDateVn(consent.acceptedAt)}.`,
      canWithdraw: true,
    };
  }
  if (consent.withdrawnAt) {
    return {
      badge: { tone: 'neutral', text: 'Đã rút đồng ý' },
      text: `Từ ngày ${formatDateVn(consent.withdrawnAt)}. Ảnh thử đồ cũ đã được xóa. Bạn sẽ được hỏi lại khi vào Phòng thử đồ.`,
      link: true,
    };
  }
  if (consent.acceptedAt) {
    return {
      badge: { tone: 'warning', text: 'Cần đồng ý lại' },
      text: 'Điều khoản gửi ảnh đã cập nhật. Ảnh thử đồ đã tạo vẫn được giữ và sẽ hiện lại sau khi bạn đồng ý lại.',
      link: true,
      canWithdraw: true,
    };
  }
  return {
    badge: { tone: 'neutral', text: 'Chưa đồng ý' },
    text: 'Bạn sẽ được hỏi khi vào Phòng thử đồ.',
    link: true,
  };
}

/** Hộp thoại "Rút đồng ý gửi ảnh?" (profile-updates.md). Hủy nhận focus mặc định. */
function WithdrawDialog({ open, onClose, onWithdrawn }) {
  const cancelRef = useRef(null);
  const countdown = useCountdown();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null); // { variant, message }
  const locked = countdown.state === 'running';

  const close = () => {
    setError(null);
    onClose();
  };

  const withdraw = async () => {
    if (pending || locked) return;
    setPending(true);
    setError(null);
    try {
      onWithdrawn(await tryonApi.withdrawConsent());
    } catch (err) {
      if (err.code === 'CANCELED') return;
      if (err.code === 'TOO_MANY_REQUESTS') {
        const seconds = Number(err.details?.retryAfterSeconds);
        countdown.start(Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_RETRY_SECONDS);
        setError({ variant: 'warning', message: TOO_FAST });
      } else {
        setError({ variant: 'danger', message: WITHDRAW_FAILED });
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Rút đồng ý gửi ảnh?"
      busy={pending}
      onClose={close}
      initialFocusRef={cancelRef}
      actions={
        <>
          <Button ref={cancelRef} variant="secondary" disabled={pending} onClick={close}>
            Hủy
          </Button>
          <Button
            variant="danger"
            loading={pending}
            loadingText="Đang rút…"
            softDisabled={locked}
            onClick={withdraw}
          >
            {locked ? `Rút đồng ý sau ${countdown.remainingSeconds} giây` : 'Rút đồng ý'}
          </Button>
        </>
      }
    >
      <p>Nếu bạn rút đồng ý:</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-small">
        <li>Chúng tôi dừng gửi ảnh của bạn tới dịch vụ AI.</li>
        <li>Mọi ảnh thử đồ đã tạo của bạn sẽ bị xóa khỏi Try-on.</li>
        <li>Ảnh hồ sơ và số đo của bạn được giữ nguyên.</li>
        <li>Bạn sẽ không thể thử đồ cho tới khi đồng ý lại.</li>
      </ul>
      <Alert variant="warning" role="group" className="mt-4">
        Không thu hồi được phần đã gửi: những ảnh đã được gửi tới {TRYON_PROVIDER.name} trước đó
        không thể xóa từ phía Try-on. Nếu một ảnh đang được tạo, ảnh đó có thể vẫn hoàn tất ở phía
        họ; kết quả sẽ bị bỏ, không hiển thị cho bạn, và lượt tạo ảnh đó vẫn bị tính.
      </Alert>
      {error && (
        <Alert
          variant={error.variant}
          role={error.variant === 'danger' ? 'alert' : 'status'}
          className="mt-4"
        >
          {error.message}
        </Alert>
      )}
    </Modal>
  );
}

/**
 * Card "Thử đồ bằng AI" (D-116): trạng thái consent gửi ảnh và nút rút đồng ý. Độc lập với ảnh và hồ sơ.
 * `ai` là kết quả của `useAiConsent`; `onWithdrawn()` để trang hiện toast.
 */
export function AiConsentCard({ ai, onWithdrawn, sectionRef }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const withdrawButtonRef = useRef(null);
  const view = ai.status === 'ready' ? describeConsent(ai.consent) : null;

  const handleWithdrawn = (data) => {
    ai.apply(data);
    setDialogOpen(false);
    onWithdrawn();
    // Nút Rút đã biến mất: focus về h2 của mục (tabIndex=-1).
    queueMicrotask(() => sectionRef.current?.focus());
  };

  return (
    <section
      id="try-on-ai"
      aria-labelledby="try-on-ai-title"
      aria-busy={ai.status === 'loading' || undefined}
      className="rounded-xl border border-line bg-surface p-5 shadow-card"
    >
      <p className="text-caption font-semibold uppercase tracking-wide text-ink-subtle">
        Quyền riêng tư
      </p>
      <h2
        id="try-on-ai-title"
        ref={sectionRef}
        tabIndex={-1}
        className="font-display text-heading font-semibold focus:outline-none"
      >
        Thử đồ bằng AI
      </h2>
      <p className="mt-2 text-small text-ink-muted">
        Để tạo ảnh bạn mặc thử sản phẩm, ảnh toàn thân của bạn được gửi tới {TRYON_PROVIDER.name},
        một dịch vụ AI bên thứ ba có thể xử lý ở ngoài Việt Nam. Việc này chỉ diễn ra khi bạn đồng
        ý.
      </p>

      {ai.status === 'loading' && (
        <div aria-hidden="true" className="mt-4 space-y-2">
          <div className="h-4 w-2/3 animate-pulse rounded-md bg-surface-muted" />
          <div className="h-4 w-1/2 animate-pulse rounded-md bg-surface-muted" />
          <div className="h-11 w-40 animate-pulse rounded-md bg-surface-muted" />
        </div>
      )}

      {ai.status === 'error' && (
        <div className="mt-4 flex flex-col items-start gap-3">
          <p role="alert" className="text-small text-danger">
            Không tải được trạng thái đồng ý.
          </p>
          <Button variant="secondary" onClick={() => ai.load()}>
            Thử lại
          </Button>
        </div>
      )}

      {view && (
        <div className="mt-4 space-y-3">
          <Badge tone={view.badge.tone} icon={view.badge.icon}>
            {view.badge.text}
          </Badge>
          <p className="text-small text-ink-muted">{view.text}</p>
          {view.link && <p className="text-small">{TO_ROOM}</p>}
          {view.canWithdraw && (
            <Button
              ref={withdrawButtonRef}
              variant="secondary"
              aria-label="Rút đồng ý gửi ảnh cho dịch vụ AI"
              onClick={() => setDialogOpen(true)}
              className="w-full !text-danger sm:w-auto"
            >
              <Undo2 size={16} aria-hidden="true" />
              Rút đồng ý
            </Button>
          )}
        </div>
      )}

      <WithdrawDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onWithdrawn={handleWithdrawn}
      />
    </section>
  );
}
