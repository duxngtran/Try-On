import { useEffect, useId, useRef, useState } from 'react';
import { Check, Info, ShoppingBag } from 'lucide-react';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { useCountdown } from '../../hooks/useCountdown.js';
import { describeInlineError } from './cartMessages.js';
import { useCart } from './cartContext.js';

/**
 * Nút Thêm vào giỏ ở khối thông tin sản phẩm (screens/add-to-cart.md). Độc lập với trạng thái ảnh: không đọc, không
 * chờ, không đổi job nào (US-07 E9, R1). Request và khóa theo từng sản phẩm nằm ở `CartProvider`, nên nút bị mount
 * lại khi đổi sản phẩm cũng không hủy request đang chạy; nút của sản phẩm mới ở trạng thái mặc định.
 *
 * Lỗi hiện thành Alert dưới nút và chỉ sống cùng nút này (mất khi bấm lại, đóng, hoặc đổi sản phẩm). Lỗi về muộn
 * khi người mua đã rời sản phẩm do provider báo bằng thông báo cấp Layout.
 *
 * @param {{ product: { id: string, name: string, priceVnd: number } }} props
 */
export function AddToCartButton({ product }) {
  const { cart, isAdding, addItem } = useCart();
  const noteId = useId();
  const alertId = useId();
  const mounted = useRef(false);
  const countdown = useCountdown();
  const [error, setError] = useState(null); // { variant, text, code }
  const [gone, setGone] = useState(false);
  const [flash, setFlash] = useState(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const line = cart?.items.find((item) => item.productId === product.id);
  const quantity = line?.quantity ?? 0;
  const maxQuantity = cart?.limits.maxQuantity ?? null;
  const atMax = maxQuantity !== null && quantity >= maxQuantity;
  const busy = isAdding(product.id);
  const locked = countdown.state === 'running';
  const rateLimited = error?.code === 'TOO_MANY_REQUESTS';
  const expired = rateLimited && countdown.state === 'finished';
  const shownError = error && !expired ? error : null;

  const click = async () => {
    setError(null);
    countdown.reset();
    // Chụp id, tên, giá tại lúc bấm; provider dùng đúng các giá trị này tới khi xong (R2).
    const outcome = await addItem({
      productId: product.id,
      name: product.name,
      priceVnd: product.priceVnd,
      isShown: () => mounted.current,
    });
    if (!mounted.current || outcome.skipped) return;
    if (outcome.ok) {
      setFlash((n) => n + 1);
      return;
    }
    const described = describeInlineError(outcome);
    setError({ ...described, code: outcome.code });
    if (outcome.code === 'NOT_FOUND') setGone(true);
    if (described.retrySeconds) countdown.start(described.retrySeconds);
  };

  const soft = gone || atMax || locked;
  let describedBy;
  if (gone && shownError) describedBy = alertId;
  else if (gone || quantity > 0 || atMax) describedBy = noteId;

  return (
    <div className="mt-3 space-y-2">
      <Button
        size="lg"
        fullWidth
        busy={busy}
        softDisabled={soft && !busy}
        loadingText="Đang thêm…"
        onClick={click}
        data-cart-add
        aria-describedby={describedBy}
        className="md:max-w-xs"
      >
        <ShoppingBag size={20} aria-hidden="true" />
        Thêm vào giỏ
      </Button>

      {((gone && !shownError) || quantity > 0 || atMax) && (
        <p
          id={noteId}
          key={flash}
          className={`inline-flex items-center gap-1.5 rounded-sm text-small text-ink-muted ${
            flash > 0 ? 'motion-safe:animate-note-flash' : ''
          }`}
        >
          {gone ? (
            <>
              <Info size={16} aria-hidden="true" className="shrink-0 text-accent-strong" />
              Sản phẩm này không còn bán.
            </>
          ) : atMax ? (
            <>
              <Info size={16} aria-hidden="true" className="shrink-0 text-accent-strong" />
              Đã đạt tối đa {maxQuantity} món trong giỏ.
            </>
          ) : (
            <>
              <Check size={16} aria-hidden="true" className="shrink-0 text-success" />
              Trong giỏ: {quantity}
            </>
          )}
        </p>
      )}

      {shownError && (
        <Alert
          variant={shownError.variant}
          role="alert"
          onClose={() => setError(null)}
          className="[&>div]:min-w-0"
        >
          <span id={alertId}>{shownError.text}</span>
          {locked && (
            <span aria-hidden="true" className="mt-1 block text-ink-muted">
              Còn {countdown.remainingSeconds} giây
            </span>
          )}
        </Alert>
      )}
      {/* Hết giờ chờ: thông báo một lần cho trình đọc màn hình, không đọc từng giây. */}
      <p role="status" className="sr-only">
        {expired ? 'Bạn có thể thêm vào giỏ lại.' : ''}
      </p>
    </div>
  );
}
