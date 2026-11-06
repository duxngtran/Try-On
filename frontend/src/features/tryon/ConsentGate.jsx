import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Ban, Building2, Clock, Globe, Send, Undo2 } from 'lucide-react';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { useCountdown } from '../../hooks/useCountdown.js';
import { tryonApi } from './tryonApi.js';
import { DEFAULT_RETRY_SECONDS, TRYON_PROVIDER } from './tryonConfig.js';

const { name: PROVIDER, domain: PROVIDER_DOMAIN } = TRYON_PROVIDER;

const CONSENT_FAILED = 'Chưa ghi nhận được sự đồng ý của bạn, vui lòng thử lại.';
const TOO_FAST = 'Bạn thao tác quá nhanh, vui lòng thử lại sau.';

/** Điều cần biết: luôn hiển thị đầy đủ, không thu gọn (try-on-consent.md, thành phần 2). */
const FACTS = [
  {
    icon: Send,
    title: 'Gửi gì',
    body: (
      <>
        Ảnh toàn thân của bạn và ảnh sản phẩm. Chiều cao, cân nặng, email và tên của bạn{' '}
        <strong>không</strong> được gửi.
      </>
    ),
  },
  {
    icon: Building2,
    title: 'Gửi cho ai',
    body: `${PROVIDER} (${PROVIDER_DOMAIN}), nhà cung cấp dịch vụ thử đồ bằng AI, cùng các đơn vị hạ tầng mà họ sử dụng.`,
  },
  {
    icon: Globe,
    title: 'Xử lý ở đâu',
    body: 'Ảnh có thể được xử lý ở ngoài Việt Nam, ví dụ tại Hoa Kỳ hoặc Singapore.',
  },
  {
    icon: Clock,
    title: 'Lưu bao lâu',
    body: `Ảnh thử đồ tạo ra được lưu riêng tư trên Try-on tối đa 90 ngày kể từ lần bạn xem gần nhất, rồi tự xóa. Theo công bố của ${PROVIDER}, ảnh bạn gửi được xóa khỏi hệ thống của họ sau khi xử lý xong (bản dự phòng được dọn trong tối đa 1 ngày), nhưng bản ghi về yêu cầu có thể được giữ lâu hơn. Thông tin này do ${PROVIDER} công bố, chúng tôi chưa tự kiểm chứng.`,
  },
  {
    icon: Ban,
    title: 'Không thu hồi được',
    body: `Khi ảnh đã được gửi đi, chúng tôi không thể thu hồi hoặc xóa phần đã được xử lý ở phía ${PROVIDER}. Rút đồng ý chỉ dừng các lần gửi tiếp theo và xóa ảnh thử đồ lưu trên Try-on.`,
  },
  {
    icon: Undo2,
    title: 'Rút đồng ý',
    body: 'Bạn có thể rút đồng ý bất cứ lúc nào ở trang Hồ sơ. Ảnh hồ sơ và số đo của bạn vẫn được giữ.',
  },
];

const CHECKBOX_LABEL = `Tôi từ đủ 18 tuổi và là người trong ảnh. Tôi đồng ý cho Try-on gửi ảnh toàn thân của tôi tới ${PROVIDER} và các đơn vị hạ tầng của họ, có thể ở ngoài Việt Nam, chỉ để tạo ảnh thử đồ. Ảnh kết quả được lưu riêng tư. Tôi có thể rút lại bất kỳ lúc nào; việc này không xóa được phần đã xử lý trước đó.`;

/** Câu mở đầu theo tình huống (bảng "Khi nào hiện"). */
function leadNotice(consent, midway) {
  if (midway) {
    return {
      variant: 'warning',
      role: 'alert',
      text: 'Đồng ý gửi ảnh của bạn không còn hiệu lực, nên ảnh thử đồ đã được gỡ khỏi màn hình.',
    };
  }
  if (consent?.withdrawnAt) {
    return {
      variant: 'info',
      role: 'status',
      text: 'Bạn đã rút đồng ý trước đó và các ảnh thử đồ cũ đã được xóa. Hãy đồng ý lại nếu muốn tiếp tục thử đồ.',
    };
  }
  if (consent?.acceptedAt) {
    return {
      variant: 'info',
      role: 'status',
      text: 'Điều khoản gửi ảnh đã được cập nhật. Vui lòng đọc và đồng ý lại. Các ảnh thử đồ đã tạo vẫn được giữ và sẽ hiện lại sau khi bạn đồng ý lại.',
    };
  }
  return null;
}

/**
 * Cổng consent G2 (screens/try-on-consent.md, D-93, D-111): ô không tích sẵn; tích ô KHÔNG tự ghi nhận, chỉ
 * khi bấm "Đồng ý và tiếp tục". `onAccepted(state)` nhận `/state` mới; `onProfileIncomplete(missing)` khi 409.
 */
export function ConsentGate({ consent, midway = false, onAccepted, onProfileIncomplete }) {
  const checkboxId = useId();
  const hintId = `${checkboxId}-hint`;
  const headingRef = useRef(null);
  const countdown = useCountdown();
  const [agreed, setAgreed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null); // { variant, message }

  useEffect(() => {
    if (midway) headingRef.current?.focus();
  }, [midway]);

  const lead = leadNotice(consent, midway);
  const locked = countdown.state === 'running';
  const submitDisabled = !agreed || locked;

  const submit = async () => {
    if (!agreed || pending || locked) return;
    setPending(true);
    setError(null);
    try {
      onAccepted(await tryonApi.acceptConsent());
    } catch (err) {
      if (err.code === 'CANCELED') return;
      if (err.status === 409 && err.code === 'PROFILE_INCOMPLETE') {
        onProfileIncomplete(err.details?.missing ?? []);
        return;
      }
      if (err.code === 'TOO_MANY_REQUESTS') {
        const seconds = Number(err.details?.retryAfterSeconds);
        countdown.start(Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_RETRY_SECONDS);
        setError({ variant: 'warning', message: TOO_FAST });
      } else {
        setError({ variant: 'danger', message: CONSENT_FAILED });
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <section
      aria-labelledby="consent-gate-title"
      className="mx-auto mt-6 max-w-xl rounded-xl border border-line bg-surface p-4 shadow-card sm:p-6"
    >
      {lead && (
        <Alert variant={lead.variant} role={lead.role} className="mb-4">
          {lead.text}
        </Alert>
      )}
      <p className="text-caption font-semibold uppercase tracking-wider text-ink-subtle">
        Trước khi thử đồ
      </p>
      <h2
        id="consent-gate-title"
        ref={headingRef}
        tabIndex={-1}
        className="mt-1 font-display text-title font-semibold focus:outline-none"
      >
        Cho phép gửi ảnh của bạn tới dịch vụ AI
      </h2>
      <p className="mt-2 text-body text-ink-muted">
        Để tạo ảnh bạn mặc thử sản phẩm, chúng tôi cần gửi ảnh toàn thân của bạn tới một dịch vụ AI
        bên thứ ba. Hãy đọc kỹ các điều dưới đây trước khi quyết định.
      </p>

      <ul className="mt-5 space-y-4">
        {FACTS.map(({ icon: Icon, title, body }) => (
          <li key={title} className="flex items-start gap-3">
            <Icon size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-accent" />
            <p className="text-small text-ink-muted">
              <span className="font-bold text-ink">{title}. </span>
              {body}
            </p>
          </li>
        ))}
      </ul>

      <label
        htmlFor={checkboxId}
        className="mt-6 flex min-h-11 cursor-pointer items-start gap-3 text-body text-ink"
      >
        <input
          id={checkboxId}
          type="checkbox"
          checked={agreed}
          disabled={pending}
          onChange={(event) => setAgreed(event.target.checked)}
          className="mt-1 h-5 w-5 shrink-0 accent-ink"
        />
        <span>{CHECKBOX_LABEL}</span>
      </label>

      {error && (
        <Alert
          variant={error.variant}
          role={error.variant === 'danger' ? 'alert' : 'status'}
          className="mt-4"
        >
          {error.message}
          {locked && (
            <span aria-hidden="true" className="mt-1 block text-ink-muted">
              Có thể thử lại sau {countdown.remainingSeconds} giây
            </span>
          )}
        </Alert>
      )}

      <div className="mt-4 flex flex-col gap-3 sm:flex-row-reverse sm:items-center sm:justify-between">
        <Button
          size="lg"
          loading={pending}
          loadingText="Đang ghi nhận…"
          softDisabled={submitDisabled}
          onClick={submit}
          aria-describedby={submitDisabled && !agreed ? hintId : undefined}
          className="w-full sm:w-auto"
        >
          Đồng ý và tiếp tục
        </Button>
        <Link
          to="/"
          aria-disabled={pending || undefined}
          onClick={(event) => pending && event.preventDefault()}
          className="inline-flex h-11 w-full items-center justify-center rounded-md px-5 text-small font-semibold text-ink hover:underline sm:w-auto"
        >
          Để sau
        </Link>
      </div>
      {!agreed && (
        <p id={hintId} className="mt-2 text-small text-ink-muted">
          Hãy đánh dấu ô đồng ý ở trên để tiếp tục.
        </p>
      )}
      <p className="mt-3 text-small text-ink-muted">
        Nếu không đồng ý, bạn vẫn dùng được các phần khác của Try-on nhưng chưa thể thử đồ. Ảnh hồ
        sơ của bạn không bị gửi đi.
      </p>
    </section>
  );
}
