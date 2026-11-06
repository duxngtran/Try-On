import { ChevronLeft, ChevronRight, LayoutGrid } from 'lucide-react';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { Spinner } from '../../components/Spinner.jsx';

const ARROW =
  'flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface shadow-card transition ' +
  'hover:shadow-pop active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink';
const ARROW_OFF =
  'cursor-not-allowed border-line bg-disabled-bg text-disabled-ink shadow-none hover:shadow-none active:scale-100';

/**
 * Nút mũi tên tròn 48 x 48 (design-system 7.12). Vô hiệu hóa bằng `aria-disabled`, KHÔNG dùng `disabled`, để người
 * dùng bàn phím không mất focus khi tới đầu hoặc cuối danh sách (D-112). `busy`: đang tải trang kế, vẫn bấm được nhưng
 * bấm lặp bị bỏ qua.
 */
export function ArrowButton({ direction, enabled, busy = false, onClick, className = '' }) {
  const forward = direction === 'next';
  const Icon = forward ? ChevronRight : ChevronLeft;
  return (
    <button
      type="button"
      data-nav={direction}
      aria-label={forward ? 'Sản phẩm tiếp theo' : 'Sản phẩm trước'}
      aria-keyshortcuts={forward ? 'ArrowRight' : 'ArrowLeft'}
      aria-disabled={enabled ? undefined : 'true'}
      aria-busy={busy || undefined}
      onClick={enabled && !busy ? onClick : undefined}
      className={`${ARROW} ${enabled ? 'text-ink' : ARROW_OFF} ${className}`}
    >
      {busy ? <Spinner size={20} label="" /> : <Icon size={24} aria-hidden="true" />}
    </button>
  );
}

/** Thông báo cuối danh sách (US-06 §4.4) hoặc lỗi tải sản phẩm kế (S15), nằm ở khối thông tin, không đè ảnh. */
export function NavNotices({ atEnd, navError, onRetry, onOtherCategory }) {
  return (
    <>
      {navError && (
        <Alert variant="danger" role="alert" className="mt-3">
          <p>
            {navError === 'next'
              ? 'Không tải được sản phẩm tiếp theo.'
              : 'Không tải được sản phẩm trước đó.'}
          </p>
          <Button variant="secondary" onClick={onRetry} className="mt-2">
            Thử lại
          </Button>
        </Alert>
      )}
      {atEnd && (
        <Alert variant="info" role="group" className="mt-3">
          <p>Bạn đã xem hết danh mục này</p>
          <Button variant="secondary" onClick={onOtherCategory} className="mt-2">
            <LayoutGrid size={16} aria-hidden="true" />
            Danh mục khác
          </Button>
        </Alert>
      )}
    </>
  );
}
