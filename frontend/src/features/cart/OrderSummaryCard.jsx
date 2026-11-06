import { Info } from 'lucide-react';
import { Button } from '../../components/Button.jsx';
import { LinkButton } from '../../components/LinkButton.jsx';
import { formatPriceVnd, spokenVnd } from './cartFormat.js';

/**
 * Tóm tắt ở trang giỏ: tổng tiền do backend trả, nút Đặt hàng, lối về phòng thử đồ (screens/cart.md mục 3).
 * Nút không dùng được thì là `<button aria-disabled>` kèm lý do, KHÔNG phải link tới /checkout.
 * @param {{ cart: import('./cartContext.js').Cart, working: boolean }} props `working`: có thao tác giỏ đang chạy hoặc bị khóa.
 */
export function OrderSummaryCard({ cart, working }) {
  const reasonId = 'cart-order-reason';
  return (
    <section
      aria-labelledby="cart-summary-heading"
      className="rounded-lg border border-line bg-surface p-4 md:p-6 lg:sticky lg:top-20"
    >
      <h2 id="cart-summary-heading" className="text-heading font-semibold">
        Tổng tiền
      </h2>
      <p className="mt-2 font-display text-title font-semibold tabular-nums" data-cart-total>
        {formatPriceVnd(cart.totalVnd)}
        <span className="sr-only">, {spokenVnd(cart.totalVnd)}</span>
      </p>
      <p className="mt-1 text-small text-ink-muted">Chưa thanh toán trực tuyến.</p>
      {cart.hasUnavailable && (
        <p className="text-small text-ink-muted">Chưa tính sản phẩm không còn bán.</p>
      )}
      <div className="mt-4 flex flex-col gap-3">
        {cart.hasUnavailable ? (
          <>
            <Button size="lg" fullWidth softDisabled aria-describedby={reasonId}>
              Đặt hàng
            </Button>
            <p id={reasonId} className="flex gap-1.5 text-small text-ink-muted">
              <Info size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-accent-strong" />
              Hãy bỏ sản phẩm không còn bán khỏi giỏ để đặt hàng.
            </p>
          </>
        ) : working ? (
          <Button size="lg" fullWidth softDisabled>
            Đặt hàng
          </Button>
        ) : (
          <LinkButton to="/checkout" size="lg" fullWidth>
            Đặt hàng
          </LinkButton>
        )}
        <LinkButton to="/try-on" variant="secondary" size="lg" fullWidth>
          Tiếp tục thử đồ
        </LinkButton>
      </div>
    </section>
  );
}
