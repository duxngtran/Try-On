import { useId, useRef, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '../../components/Button.jsx';
import { Modal } from '../../components/Modal.jsx';
import { Spinner } from '../../components/Spinner.jsx';
import { profileApi } from './profileApi.js';

const CONSENT_FAILED = 'Chưa ghi nhận được sự đồng ý của bạn, vui lòng thử lại.';

/**
 * Khối consent (profile-consent.md, D-22). Tích checkbox là ghi nhận ngay qua API; thành công thì thu
 * gọn thành một dòng. `externalError` là lỗi CONSENT_REQUIRED từ lần tải ảnh gần nhất.
 */
export function ConsentBlock({ consent, applyProfile, checkboxRef, externalError }) {
  const checkboxId = useId();
  const messageId = `${checkboxId}-msg`;
  const detailCloseRef = useRef(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);

  if (consent.accepted) {
    return (
      <p className="flex items-center gap-1.5 text-small text-success">
        <CheckCircle2 size={16} aria-hidden="true" className="shrink-0" />
        Bạn đã đồng ý sử dụng ảnh
      </p>
    );
  }

  const accept = async (event) => {
    if (!event.target.checked || pending) return;
    setPending(true);
    setError(null);
    try {
      applyProfile(await profileApi.acceptConsent());
    } catch (err) {
      if (err.code !== 'CANCELED') setError(CONSENT_FAILED);
    } finally {
      setPending(false);
    }
  };

  const message = error ?? externalError;
  // Đồng ý rồi nhưng version đã đổi: server trả accepted=false và còn acceptedAt.
  const versionChanged = consent.acceptedAt != null;

  return (
    <div>
      {versionChanged && (
        <p className="mb-2 text-small text-ink-muted">
          Điều khoản sử dụng ảnh đã cập nhật, vui lòng đồng ý lại.
        </p>
      )}
      <div className="flex items-start gap-3">
        <input
          ref={checkboxRef}
          id={checkboxId}
          type="checkbox"
          checked={pending}
          disabled={pending}
          onChange={accept}
          aria-describedby={message ? messageId : undefined}
          className="mt-0.5 h-5 w-5 shrink-0 accent-ink"
        />
        <div className="text-small">
          <label htmlFor={checkboxId} className="text-ink">
            Tôi đồng ý cho Try-on lưu trữ và sử dụng ảnh này để tạo ảnh thử đồ, bao gồm việc gửi ảnh
            tới dịch vụ AI xử lý ảnh.
          </label>{' '}
          <button
            type="button"
            onClick={() => setDetailOpen(true)}
            className="font-semibold text-accent-strong underline hover:text-ink"
          >
            Xem chi tiết
          </button>
          {pending && (
            <span className="ml-2 inline-flex align-middle">
              <Spinner label="Đang ghi nhận" />
            </span>
          )}
        </div>
      </div>
      <p
        id={messageId}
        role={message ? 'alert' : undefined}
        className={message ? 'mt-1.5 text-small text-danger' : 'hidden'}
      >
        {message}
      </p>
      <Modal
        open={detailOpen}
        title="Cách chúng tôi dùng ảnh của bạn"
        onClose={() => setDetailOpen(false)}
        initialFocusRef={detailCloseRef}
        actions={
          <Button ref={detailCloseRef} onClick={() => setDetailOpen(false)}>
            Đã hiểu
          </Button>
        }
      >
        <ul className="list-disc space-y-2 pl-5 text-small">
          <li>Ảnh được lưu riêng tư, chỉ bạn xem được qua liên kết tạm thời.</li>
          <li>Ảnh được gửi tới dịch vụ AI để tạo ảnh bạn mặc thử sản phẩm.</li>
          <li>Quản trị viên không xem được ảnh của bạn.</li>
          <li>Bạn có thể xóa ảnh bất cứ lúc nào để dừng việc sử dụng.</li>
        </ul>
      </Modal>
    </div>
  );
}
