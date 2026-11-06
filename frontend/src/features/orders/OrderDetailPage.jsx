import { useEffect, useRef, useState } from 'react';
import { PackageX, SearchX, WifiOff } from 'lucide-react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { LinkButton } from '../../components/LinkButton.jsx';
import { Skeleton } from '../../components/Skeleton.jsx';
import { useCountdown } from '../../hooks/useCountdown.js';
import { usePageTitle } from '../../hooks/usePageTitle.js';
import { ProductThumb } from '../admin/ProductThumb.jsx';
import { formatPriceVnd, spokenVnd } from '../cart/cartFormat.js';
import { formatOrderTime } from './orderFormat.js';
import { ordersApi } from './ordersApi.js';

const LOAD_ERROR = 'Không thể tải đơn hàng. Vui lòng kiểm tra mạng và thử lại.';
const PAYMENT_NOTE =
  'Chưa thanh toán trực tuyến. Cửa hàng sẽ liên hệ theo số điện thoại bạn cung cấp.';

function OrderItemRow({ item }) {
  return (
    <li className="flex items-start gap-3 py-3">
      {item.image ? (
        <ProductThumb
          url={item.image.url}
          name={item.name}
          sizeClass="h-16 w-16 md:h-20 md:w-20"
          pixels={80}
        />
      ) : (
        <div className="h-16 w-16 shrink-0 rounded-md bg-surface-muted md:h-20 md:w-20" />
      )}
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-body font-semibold" title={item.name}>
          {item.name}
        </p>
        {!item.stillOnSale && (
          <p className="mt-1 inline-flex items-center gap-1 rounded-sm bg-warning-soft px-2 py-0.5 text-caption font-semibold text-warning">
            <PackageX size={14} aria-hidden="true" />
            Đã ngừng bán
          </p>
        )}
        <p className="text-small tabular-nums text-ink-muted">
          {formatPriceVnd(item.unitPriceVnd)} × {item.quantity}
        </p>
      </div>
      <p className="text-body font-semibold tabular-nums">
        {formatPriceVnd(item.lineTotalVnd)}
        <span className="sr-only">, thành tiền {spokenVnd(item.lineTotalVnd)}</span>
      </p>
    </li>
  );
}

/**
 * Chi tiết đơn `/orders/:id`, kiêm trang xác nhận sau khi đặt (screens/orders.md). Tên, giá, số lượng là BẢN CHỤP
 * lúc đặt; ảnh và nhãn "Đã ngừng bán" là của sản phẩm hiện tại (D-142). Không có trạng thái đơn, không hủy, không sửa.
 */
export function OrderDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const countdown = useCountdown();
  const headingRef = useRef(null);
  // Banner chỉ cho lần tới từ /checkout: chụp một lần rồi xóa khỏi history state (tải lại, Back không hiện lại).
  const [placed] = useState(() => Boolean(location.state?.placed));
  const from = location.state?.from ?? '';
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ key: null, order: null, error: null });
  const key = `${id}|${attempt}`;

  useEffect(() => {
    const controller = new AbortController();
    ordersApi
      .get(id, { signal: controller.signal })
      .then((order) => setState({ key, order, error: null }))
      .catch((error) => {
        if (error?.code === 'CANCELED') return;
        setState({ key, order: null, error });
      });
    return () => controller.abort();
  }, [id, key]);

  useEffect(() => {
    if (location.state?.placed) {
      navigate(`${location.pathname}${location.search}`, {
        replace: true,
        state: { from: location.state.from },
      });
    }
  }, [location.state, location.pathname, location.search, navigate]);

  const current = state.key === key;
  const order = current ? state.order : null;
  const error = current ? state.error : null;
  const notFound = error?.code === 'NOT_FOUND';
  const rateLimited = error?.code === 'TOO_MANY_REQUESTS';
  usePageTitle(order ? `Đơn ${order.code}` : 'Đơn hàng');

  useEffect(() => {
    if (rateLimited) {
      const seconds = Number(error.details?.retryAfterSeconds);
      countdown.start(Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : 60);
    }
    // countdown.start ổn định theo `useCallback`; chỉ phản ứng khi có lỗi mới.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rateLimited, error]);

  const reload = () => setAttempt((n) => n + 1);
  const waiting = rateLimited && countdown.state === 'running';
  const backTo = `/orders${from}`;

  return (
    <section>
      <Link
        to={backTo}
        className="inline-flex h-11 items-center text-small font-semibold text-accent-strong underline hover:text-ink"
      >
        <span aria-hidden="true">←&nbsp;</span>Đơn của tôi
      </Link>
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="font-display text-title font-semibold outline-none md:text-display"
      >
        {order ? `Đơn ${order.code}` : 'Đơn hàng'}
      </h1>
      {order && (
        <p className="text-small text-ink-muted">
          Đặt lúc <time dateTime={order.createdAt}>{formatOrderTime(order.createdAt)}</time>
        </p>
      )}

      {!order && !error && (
        <div aria-busy="true" className="mt-6 space-y-4">
          <p role="status" className="sr-only">
            Đang tải đơn hàng
          </p>
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {notFound && (
        <div className="mt-10 flex flex-col items-center gap-3 text-center">
          <SearchX size={40} aria-hidden="true" className="text-ink-subtle" />
          <h2 className="text-heading font-semibold">Không tìm thấy đơn hàng.</h2>
          <LinkButton to="/orders" variant="secondary">
            Về Đơn của tôi
          </LinkButton>
        </div>
      )}

      {error && !notFound && (
        <div className="mt-10 flex flex-col items-center gap-3 text-center">
          <WifiOff size={40} aria-hidden="true" className="text-ink-subtle" />
          {rateLimited ? (
            <p className="text-body">
              Bạn thao tác quá nhanh, thử lại sau {countdown.remainingSeconds} giây.
            </p>
          ) : (
            <p className="text-body">{LOAD_ERROR}</p>
          )}
          <Button softDisabled={waiting} onClick={waiting ? undefined : reload}>
            Thử lại
          </Button>
          <Link
            to="/orders"
            className="inline-flex h-11 items-center text-small font-semibold text-accent-strong underline hover:text-ink"
          >
            Về Đơn của tôi
          </Link>
        </div>
      )}

      {order && (
        <>
          <div className="mt-4">
            {placed ? (
              <Alert variant="success" role="status">
                <p className="font-bold">Đã ghi nhận đơn hàng {order.code}.</p>
                <p>{PAYMENT_NOTE}</p>
              </Alert>
            ) : (
              <Alert variant="info" role="group" aria-label="Lưu ý về thanh toán">
                {PAYMENT_NOTE}
              </Alert>
            )}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="lg:col-span-8">
              <ul className="divide-y divide-line">
                {order.items.map((item) => (
                  <OrderItemRow key={item.productId} item={item} />
                ))}
              </ul>
              <div className="flex items-baseline justify-between gap-3 border-t border-line pt-3">
                <div>
                  <p className="text-heading font-bold">Tổng tiền</p>
                  <p className="text-small text-ink-muted">{order.itemCount} món</p>
                </div>
                <p className="font-display text-title font-semibold tabular-nums" data-order-total>
                  {formatPriceVnd(order.totalVnd)}
                  <span className="sr-only">, {spokenVnd(order.totalVnd)}</span>
                </p>
              </div>
              <p className="mt-3 text-small text-ink-muted">
                Tên, giá và số lượng ghi theo lúc đặt hàng. Ảnh là ảnh hiện tại của sản phẩm.
              </p>
            </div>

            <section
              aria-labelledby="order-recipient-heading"
              className="rounded-lg border border-line bg-surface p-4 md:p-6 lg:col-span-4 lg:sticky lg:top-20 lg:self-start"
            >
              <h2 id="order-recipient-heading" className="text-heading font-semibold">
                Thông tin nhận hàng
              </h2>
              <dl className="mt-3 flex flex-col gap-3 text-body md:grid md:grid-cols-[120px_1fr] lg:flex">
                <dt className="text-small text-ink-muted">Người nhận</dt>
                <dd className="break-words font-semibold">{order.recipient.name}</dd>
                <dt className="text-small text-ink-muted">Số điện thoại</dt>
                <dd className="break-words font-semibold tabular-nums">{order.recipient.phone}</dd>
                <dt className="text-small text-ink-muted">Địa chỉ</dt>
                <dd className="whitespace-pre-line break-words font-semibold">
                  {order.recipient.address}
                </dd>
              </dl>
            </section>
          </div>

          {placed && (
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <LinkButton to="/orders" variant="secondary">
                Xem tất cả đơn hàng
              </LinkButton>
              <LinkButton to="/try-on">Tiếp tục thử đồ</LinkButton>
            </div>
          )}
        </>
      )}
    </section>
  );
}
