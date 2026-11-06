import { useId } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Spinner } from '../../components/Spinner.jsx';

const BUTTON =
  'flex h-11 w-11 items-center justify-center border border-line-strong bg-surface text-ink transition active:scale-[0.96] hover:bg-surface-muted focus-visible:z-10';
const LOCKED = 'cursor-not-allowed !bg-disabled-bg !text-disabled-ink active:!scale-100';

/**
 * Bộ chọn số lượng (screens/cart.md mục 2). Không có ô nhập: chỉ gửi số tuyệt đối hợp lệ (n−1, n+1).
 * Nút khóa dùng `aria-disabled`, không dùng `disabled`: người dùng bàn phím không mất focus (D-112, D-160).
 * `−` khóa ở 1 (muốn xóa dùng Bỏ); `+` khóa ở mức tối đa, kèm dòng mô tả; trong lúc cập nhật số được thay bằng spinner.
 * @param {{
 *   name: string, quantity: number, maxQuantity: number, busy: boolean, locked?: boolean,
 *   describedBy?: string, onSet: (quantity: number) => void,
 * }} props `locked`: khóa tạm cả hai nút (đang đếm ngược 429, đặt hàng đang chạy).
 */
export function QuantityStepper({
  name,
  quantity,
  maxQuantity,
  busy,
  locked = false,
  describedBy,
  onSet,
}) {
  const maxId = useId();
  const atMax = quantity >= maxQuantity;
  const minusLocked = quantity <= 1 || busy || locked;
  const plusLocked = atMax || busy || locked;
  const describe = [atMax && maxId, describedBy].filter(Boolean).join(' ') || undefined;
  return (
    <div>
      <div role="group" aria-label={`Số lượng ${name}`} className="inline-flex">
        <button
          type="button"
          aria-label={`Giảm số lượng ${name}`}
          aria-disabled={minusLocked || undefined}
          onClick={minusLocked ? undefined : () => onSet(quantity - 1)}
          className={`${BUTTON} rounded-l-md ${minusLocked ? LOCKED : ''}`}
        >
          <Minus size={16} aria-hidden="true" />
        </button>
        <span
          aria-live="off"
          className="flex h-11 min-w-10 items-center justify-center border-y border-line-strong bg-surface px-2 text-body font-semibold tabular-nums"
        >
          {busy ? (
            <Spinner size={16} label="Đang cập nhật" />
          ) : (
            <span aria-label={`${quantity}`}>{quantity}</span>
          )}
        </span>
        <button
          type="button"
          aria-label={`Tăng số lượng ${name}`}
          aria-disabled={plusLocked || undefined}
          aria-describedby={describe}
          onClick={plusLocked ? undefined : () => onSet(quantity + 1)}
          className={`${BUTTON} rounded-r-md ${plusLocked ? LOCKED : ''}`}
        >
          <Plus size={16} aria-hidden="true" />
        </button>
      </div>
      {atMax && (
        <p id={maxId} className="mt-1 text-small text-ink-muted">
          Đã đạt tối đa {maxQuantity} món.
        </p>
      )}
    </div>
  );
}
