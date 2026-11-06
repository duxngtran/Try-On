import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { useCart } from './cartContext.js';

const TOAST =
  'pointer-events-none flex max-w-[360px] animate-toast-in items-center gap-2 rounded-md px-4 py-3 text-small text-ink-inverse shadow-pop';

/**
 * Thông báo của giỏ, cấp Layout (D-156, entry-points.md mục 3). Toast không tương tác: container và toast đều
 * `pointer-events: none`, không nút đóng, không link, nên không chặn chạm hay vuốt ở phòng thử đồ trong lúc hiện.
 * Vùng `role="status"` luôn có trong DOM cho lời xác nhận (vùng riêng thay vì vùng `aria-live` của phòng, vì vùng đó
 * gộp theo 400 ms và có thể nuốt lời xác nhận); toast lỗi tự có `role="alert"` khi xuất hiện.
 * Văn bản trong DOM luôn đầy đủ; `line-clamp-3` chỉ cắt phần nhìn thấy.
 */
export function CartNotice() {
  const { notice } = useCart();
  return (
    <div
      data-cart-notice
      className="pointer-events-none fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 flex justify-center"
    >
      <div role="status" aria-atomic="true" className="pointer-events-none">
        {notice?.kind === 'success' && (
          <div key={notice.id} className={`${TOAST} bg-ink`}>
            <CheckCircle2 size={18} aria-hidden="true" className="shrink-0 text-[#8FD3B0]" />
            <span className="line-clamp-3">{notice.message}</span>
          </div>
        )}
      </div>
      {notice?.kind === 'error' && (
        <div key={notice.id} role="alert" className={`${TOAST} bg-danger`}>
          <AlertCircle size={18} aria-hidden="true" className="shrink-0" />
          <span className="line-clamp-3">{notice.message}</span>
        </div>
      )}
    </div>
  );
}
