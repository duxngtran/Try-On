import { useId } from 'react';
import { ChevronDown, RefreshCw } from 'lucide-react';
import { Link } from 'react-router';
import { ProductThumb } from '../admin/ProductThumb.jsx';
import { formatPriceVnd, spokenVnd } from '../cart/cartFormat.js';

/**
 * Tóm tắt giỏ ở `/checkout` (screens/checkout.md mục 1), chỉ đọc. Mọi số lấy từ `GET /cart` gần nhất của trang này,
 * không tự tính. Mobile thu gọn mặc định nhưng tổng tiền luôn thấy; từ md luôn mở.
 * `changedIds`: dòng khác bản trước sau `CART_CHANGED` (so sánh hai bản `GET /cart` chỉ để đánh dấu, không tính tiền).
 * @param {{
 *   cart: import('../cart/cartContext.js').Cart, changedIds: Set<string>, open: boolean, onToggle: () => void,
 * }} props
 */
export function CheckoutSummary({ cart, changedIds, open, onToggle }) {
  const listId = useId();
  return (
    <section
      aria-labelledby="checkout-summary-heading"
      className="rounded-lg border border-line bg-surface p-4 md:p-6"
    >
      <h2 id="checkout-summary-heading" className="text-heading font-semibold">
        Đơn hàng của bạn
      </h2>
      <p className="text-small text-ink-muted">
        {cart.lineCount} sản phẩm, {cart.itemCount} món
      </p>

      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={onToggle}
        className="mt-1 flex h-11 items-center gap-1 text-small font-semibold text-accent-strong underline md:hidden"
      >
        {open ? 'Ẩn chi tiết' : 'Xem chi tiết'}
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={open ? 'rotate-180 transition-transform' : 'transition-transform'}
        />
      </button>

      <ul id={listId} className={`${open ? 'block' : 'hidden'} mt-2 divide-y divide-line md:block`}>
        {cart.items.map((item) => (
          <li key={item.productId} className="flex items-center gap-3 py-3">
            <ProductThumb url={item.image.url} name={item.name} sizeClass="h-14 w-14" pixels={56} />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-small font-semibold" title={item.name}>
                {item.name}
              </p>
              <p className="text-small tabular-nums text-ink-muted">
                {item.quantity} × {formatPriceVnd(item.priceVnd)}
              </p>
              {changedIds.has(item.productId) && (
                <p className="mt-1 inline-flex items-center gap-1 rounded-sm bg-accent-soft px-2 py-0.5 text-small font-semibold text-accent-strong">
                  <RefreshCw size={14} aria-hidden="true" />
                  Đã thay đổi
                </p>
              )}
            </div>
            <p className="text-small font-semibold tabular-nums">
              {formatPriceVnd(item.lineTotalVnd)}
              <span className="sr-only">, thành tiền {spokenVnd(item.lineTotalVnd)}</span>
            </p>
          </li>
        ))}
      </ul>

      <div className="mt-2 flex items-baseline justify-between border-t border-line pt-3">
        <span className="text-heading font-bold">Tổng tiền</span>
        <span className="text-heading font-bold tabular-nums" data-checkout-total>
          {formatPriceVnd(cart.totalVnd)}
          <span className="sr-only">, {spokenVnd(cart.totalVnd)}</span>
        </span>
      </div>
      <p className="mt-1 text-small text-ink-muted">Chưa thanh toán trực tuyến.</p>
      <Link
        to="/cart"
        className="mt-1 inline-flex h-11 items-center text-small font-semibold text-accent-strong underline hover:text-ink"
      >
        Sửa giỏ hàng
      </Link>
    </section>
  );
}
