import { useState } from 'react';
import { ShoppingBag } from 'lucide-react';
import { useCart } from './cartContext.js';

/** "Giỏ hàng", "Giỏ hàng, trống", "Giỏ hàng, 3 món", kèm cảnh báo khi có dòng ngừng bán (entry-points.md mục 1). */
function accessibleName(cart) {
  if (!cart) return 'Giỏ hàng';
  if (cart.itemCount === 0) return 'Giỏ hàng, trống';
  return `Giỏ hàng, ${cart.itemCount} món${cart.hasUnavailable ? ', có sản phẩm không còn bán' : ''}`;
}

/**
 * Biểu tượng giỏ hàng và số món trên header, chỉ cho role `user` (Layout quyết định).
 * Chưa là liên kết: trang `/cart` thuộc US-08 (T-116 bật link, như D-62), nên ở story này chỉ là chỉ báo.
 * Chưa biết số (đang tải lần đầu, tải lỗi): chỉ icon, không badge, không báo lỗi ở header.
 */
export function CartIndicator() {
  const { cart } = useCart();
  const count = cart?.itemCount ?? null;

  // Badge nảy 200 ms khi số tăng (chỉ `transform`; reduced motion tắt bằng `motion-safe`).
  const [seen, setSeen] = useState(count);
  const [pops, setPops] = useState(0);
  if (count !== seen) {
    setSeen(count);
    if (count !== null && seen !== null && count > seen) setPops(pops + 1);
  }

  return (
    <span
      role="img"
      aria-label={accessibleName(cart)}
      data-cart-indicator
      className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center text-ink"
    >
      <ShoppingBag size={24} aria-hidden="true" />
      {count > 0 && (
        <span
          key={pops}
          aria-hidden="true"
          className={`absolute right-0 top-0 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-ink px-1 text-caption font-bold text-ink-inverse ${
            pops > 0 ? 'motion-safe:animate-badge-pop' : ''
          }`}
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
      {cart?.hasUnavailable && (
        <span
          aria-hidden="true"
          className="absolute bottom-1 right-1 h-2 w-2 rounded-full bg-warning"
        />
      )}
    </span>
  );
}
