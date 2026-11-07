import { useCallback, useEffect, useRef, useState } from 'react';
import { ShoppingBag, WifiOff } from 'lucide-react';
import { Link } from 'react-router';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { LinkButton } from '../../components/LinkButton.jsx';
import { Skeleton } from '../../components/Skeleton.jsx';
import { useCountdown } from '../../hooks/useCountdown.js';
import { usePageTitle } from '../../hooks/usePageTitle.js';
import { CartLine } from './CartLine.jsx';
import { spokenVnd } from './cartFormat.js';
import { useCart } from './cartContext.js';
import { describeCartActionError } from './cartMessages.js';
import { OrderSummaryCard } from './OrderSummaryCard.jsx';

const retrySeconds = (details) => {
  const seconds = Number(details?.retryAfterSeconds);
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : 60;
};

function CartSkeleton() {
  return (
    <div aria-busy="true" className="mt-6">
      <p role="status" className="sr-only">
        Đang tải giỏ hàng
      </p>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="divide-y divide-line rounded-lg border border-line bg-surface lg:col-span-8">
          {[0, 1, 2].map((n) => (
            <div key={n} className="flex gap-3 p-4">
              <Skeleton className="h-[72px] w-[72px] shrink-0 md:h-24 md:w-24" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-11 w-32" />
              </div>
            </div>
          ))}
        </div>
        <Skeleton className="h-48 lg:col-span-4" />
      </div>
    </div>
  );
}

/** Trang giỏ hàng `/cart` (screens/cart.md, US-08 §4.1, §4.2). Giỏ chỉ đổi theo response của server. */
export function CartPage() {
  usePageTitle('Giỏ hàng');
  const { cart, status, refresh, setQuantity, removeItem, isLineBusy } = useCart();
  const countdown = useCountdown();
  const headingRef = useRef(null);
  const emptyRef = useRef(null);
  const focusAfter = useRef(null);
  const [notice, setNotice] = useState(null); // { id, variant, role, text, closable, retry? }
  const [lineErrors, setLineErrors] = useState({});
  const [live, setLive] = useState('');
  const [retrying, setRetrying] = useState(false);

  // Mở trang là đọc giỏ mới (flows/cart-view.md); bản của provider hiện ngay trong lúc chờ.
  useEffect(() => {
    refresh();
  }, [refresh]);

  const locked = countdown.state === 'running';
  const items = cart?.items ?? [];
  const working = locked || items.some((item) => isLineBusy(item.productId));
  const unavailableCount = items.filter((item) => !item.available).length;

  // Sau khi bỏ dòng, focus về dòng kế tiếp (hoặc dòng trước, hoặc tiêu đề trạng thái trống) thay vì rơi về body.
  useEffect(() => {
    const target = focusAfter.current;
    if (!target || !cart) return;
    if (items.some((item) => item.productId === target.removed)) return; // chưa cập nhật xong
    focusAfter.current = null;
    const candidate =
      target.neighbor && document.querySelector(`[data-remove="${target.neighbor}"]`);
    (candidate ?? emptyRef.current)?.focus();
  }, [cart, items]);

  const showError = useCallback(
    (outcome, { name, productId } = {}) => {
      if (outcome.code === 'CART_QUANTITY_LIMIT' && productId) {
        const max = outcome.details?.maxQuantity ?? cart?.limits.maxQuantity;
        setLineErrors((prev) => ({
          ...prev,
          [productId]: Number.isFinite(max)
            ? `Mỗi sản phẩm chỉ đặt tối đa ${max} món.`
            : 'Mỗi sản phẩm có giới hạn số lượng trong giỏ.',
        }));
        return;
      }
      if (outcome.code === 'TOO_MANY_REQUESTS') {
        const seconds = retrySeconds(outcome.details);
        countdown.start(seconds);
        setNotice({
          id: Date.now(),
          variant: 'warning',
          role: 'status',
          text: describeCartActionError(outcome, { name }).text,
          countdown: true,
        });
        return;
      }
      if (outcome.code === 'NOT_FOUND') {
        const latest = outcome.cart;
        if (!latest) {
          setNotice({
            id: Date.now(),
            variant: 'warning',
            role: 'status',
            text: 'Không cập nhật được giỏ hàng.',
            retry: true,
            closable: true,
          });
          return;
        }
        const stillThere = latest.items.find((item) => item.productId === productId);
        setNotice(
          stillThere
            ? {
                id: Date.now(),
                variant: 'warning',
                role: 'status',
                text: `${stillThere.name} vừa ngừng bán.`,
                closable: true,
              }
            : {
                id: Date.now(),
                variant: 'info',
                role: 'status',
                text: 'Sản phẩm này không còn trong giỏ.',
                closable: true,
              },
        );
        return;
      }
      const { text } = describeCartActionError(outcome, { name });
      setNotice({ id: Date.now(), variant: 'danger', role: 'alert', text, closable: true });
    },
    [cart, countdown],
  );

  const clearLineError = (productId) =>
    setLineErrors((prev) => {
      if (!(productId in prev)) return prev;
      const next = { ...prev };
      delete next[productId];
      return next;
    });

  const onSet = async (item, quantity) => {
    clearLineError(item.productId);
    setNotice((prev) => (prev?.countdown ? prev : null));
    const outcome = await setQuantity(item.productId, quantity);
    if (outcome.skipped) return;
    if (outcome.ok) {
      setLive(`${item.name}: số lượng ${quantity}. Tổng tiền ${spokenVnd(outcome.cart.totalVnd)}.`);
      return;
    }
    showError(outcome, { name: item.name, productId: item.productId });
  };

  const onRemove = async (item, index) => {
    clearLineError(item.productId);
    setNotice((prev) => (prev?.countdown ? prev : null));
    const neighbor = items[index + 1] ?? items[index - 1] ?? null;
    focusAfter.current = { removed: item.productId, neighbor: neighbor?.productId ?? null };
    const outcome = await removeItem(item.productId);
    if (outcome.skipped) return;
    if (outcome.ok) {
      setLive(
        outcome.cart.items.length === 0
          ? `Đã bỏ ${item.name} khỏi giỏ. Giỏ hàng đang trống.`
          : `Đã bỏ ${item.name} khỏi giỏ. Tổng tiền ${spokenVnd(outcome.cart.totalVnd)}.`,
      );
      return;
    }
    focusAfter.current = null;
    showError(outcome, { name: item.name, productId: item.productId });
  };

  const retryLoad = async () => {
    setRetrying(true);
    const loaded = await refresh();
    setRetrying(false);
    if (loaded) headingRef.current?.focus();
  };

  const shownNotice = notice && (!notice.countdown || locked) ? notice : null;
  const ready = status === 'ready' && cart;
  const empty = ready && cart.lineCount === 0;

  return (
    <section>
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="font-display text-title font-semibold outline-none md:text-display"
      >
        Giỏ hàng
      </h1>
      {ready && !empty && <p className="text-small text-ink-muted">{cart.itemCount} món</p>}

      {ready && !empty && (
        <div className="mt-4 flex flex-col gap-3">
          {cart.hasUnavailable && (
            <Alert variant="warning" role="status">
              Có {unavailableCount} sản phẩm không còn bán. Hãy bỏ chúng khỏi giỏ để đặt hàng.
            </Alert>
          )}
          {shownNotice && (
            <Alert
              key={shownNotice.id}
              variant={shownNotice.variant}
              role={shownNotice.role}
              onClose={shownNotice.closable ? () => setNotice(null) : undefined}
            >
              {shownNotice.text}
              {shownNotice.countdown && (
                <span aria-hidden="true" className="ml-1 text-ink-muted">
                  ({countdown.remainingSeconds} giây)
                </span>
              )}
              {shownNotice.retry && (
                <>
                  {' '}
                  <button type="button" onClick={refresh} className="font-semibold underline">
                    Thử lại
                  </button>
                </>
              )}
            </Alert>
          )}
        </div>
      )}

      {status === 'loading' && <CartSkeleton />}

      {status === 'error' && (
        <div className="mt-10 flex flex-col items-center gap-3 text-center">
          <WifiOff size={40} aria-hidden="true" className="text-ink-subtle" />
          <p className="text-body">Không thể tải giỏ hàng. Vui lòng kiểm tra mạng và thử lại.</p>
          <Button busy={retrying} loadingText="Đang thử lại…" onClick={retryLoad}>
            Thử lại
          </Button>
        </div>
      )}

      {empty && (
        <div className="mt-6 flex flex-col items-center gap-3 py-12 text-center">
          <ShoppingBag size={40} aria-hidden="true" className="text-ink-subtle" />
          <h2 ref={emptyRef} tabIndex={-1} className="text-heading font-semibold outline-none">
            Giỏ hàng của bạn đang trống
          </h2>
          <p className="text-small text-ink-muted">Thử đồ rồi thêm sản phẩm bạn thích vào đây.</p>
          <LinkButton to="/try-on">Vào phòng thử đồ</LinkButton>
          <Link
            to="/orders"
            className="inline-flex h-11 items-center text-small font-semibold text-accent-strong underline hover:text-ink"
          >
            Xem đơn của tôi
          </Link>
        </div>
      )}

      {ready && !empty && (
        <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-12">
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface lg:col-span-8">
            {items.map((item, index) => (
              <CartLine
                key={item.productId}
                item={item}
                maxQuantity={cart.limits.maxQuantity}
                busy={isLineBusy(item.productId)}
                locked={locked}
                error={lineErrors[item.productId]}
                onSet={(quantity) => onSet(item, quantity)}
                onRemove={() => onRemove(item, index)}
              />
            ))}
          </ul>
          <div className="lg:col-span-4">
            <OrderSummaryCard cart={cart} working={working} />
          </div>
        </div>
      )}

      <p role="status" aria-atomic="true" className="sr-only">
        {live}
      </p>
    </section>
  );
}
