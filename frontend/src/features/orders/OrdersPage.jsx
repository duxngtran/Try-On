import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ReceiptText, WifiOff } from 'lucide-react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { LinkButton } from '../../components/LinkButton.jsx';
import { Skeleton } from '../../components/Skeleton.jsx';
import { useCountdown } from '../../hooks/useCountdown.js';
import { usePageTitle } from '../../hooks/usePageTitle.js';
import { formatPriceVnd, spokenVnd } from '../cart/cartFormat.js';
import { formatOrderTime } from './orderFormat.js';
import { ordersApi } from './ordersApi.js';

const LOAD_ERROR = 'Không thể tải đơn hàng. Vui lòng kiểm tra mạng và thử lại.';

/** `page` sai (không phải số nguyên >= 1) coi là 1 trước khi gọi API (screens/orders.md, "Trạng thái URL"). */
export function normalizePage(value) {
  const n = Number(value);
  return /^[0-9]+$/.test(value ?? '') && Number.isSafeInteger(n) && n >= 1 ? n : 1;
}

const buildSearch = (page) => (page > 1 ? `?page=${page}` : '');

function Pagination({ pagination, onPage, busy }) {
  const { page, limit, total, totalPages } = pagination;
  if (totalPages <= 1) return null;
  const first = (page - 1) * limit + 1;
  const last = Math.min(page * limit, total);
  return (
    <nav aria-label="Phân trang" className="mt-4">
      <div className="flex items-center justify-between gap-3">
        <Button
          variant="secondary"
          softDisabled={page <= 1 || busy}
          onClick={() => onPage(page - 1)}
          aria-label="Trang trước"
        >
          <ChevronLeft size={16} aria-hidden="true" />
          Trước
        </Button>
        <p className="text-small text-ink-muted">
          Trang {page} / {totalPages}
        </p>
        <Button
          variant="secondary"
          softDisabled={page >= totalPages || busy}
          onClick={() => onPage(page + 1)}
          aria-label="Trang sau"
        >
          Sau
          <ChevronRight size={16} aria-hidden="true" />
        </Button>
      </div>
      <p className="mt-2 text-center text-small text-ink-muted">
        Hiển thị {first}–{last} trên {total} đơn
      </p>
    </nav>
  );
}

function OrderRow({ order, from }) {
  return (
    <li>
      <Link
        to={`/orders/${order.id}`}
        state={{ from }}
        className="flex flex-col gap-1 px-4 py-3 hover:bg-surface-muted focus-visible:-outline-offset-2 md:grid md:grid-cols-[140px_1fr_80px_140px_24px] md:items-center md:gap-4"
      >
        <span className="flex items-baseline justify-between gap-3 md:contents">
          <span className="text-body font-bold tabular-nums">{order.code}</span>
          <span className="text-body font-semibold tabular-nums md:order-4 md:text-right">
            {formatPriceVnd(order.totalVnd)}
            <span className="sr-only">, {spokenVnd(order.totalVnd)}</span>
          </span>
        </span>
        <span className="flex items-center justify-between gap-3 text-small text-ink-muted md:contents">
          <time dateTime={order.createdAt} className="md:order-2">
            {formatOrderTime(order.createdAt)}
          </time>
          <span className="md:order-3">{order.itemCount} món</span>
          <ChevronRight size={20} aria-hidden="true" className="md:order-5" />
        </span>
      </Link>
    </li>
  );
}

/** Đơn của tôi `/orders` (screens/orders.md). Trang nằm trên URL (D-61); trang vượt tổng lùi về trang cuối (D-65). */
export function OrdersPage() {
  usePageTitle('Đơn của tôi');
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const page = normalizePage(searchParams.get('page'));
  const countdown = useCountdown();
  const headingRef = useRef(null);
  const previousPage = useRef(page);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ key: null, data: null, error: null });
  const key = `${page}|${attempt}`;

  useEffect(() => {
    const controller = new AbortController();
    ordersApi
      .list({ page, signal: controller.signal })
      .then((data) => setState({ key, data, error: null }))
      .catch((error) => {
        if (error?.code === 'CANCELED') return;
        setState((prev) => ({ ...prev, key, error }));
      });
    return () => controller.abort();
  }, [page, key]);

  const current = state.key === key;
  const error = current ? state.error : null;
  const data = state.data;
  const settled = current && !error;

  // Back từ 400 `page`: nếu API vẫn từ chối `page` thì về trang 1, không để người dùng kẹt.
  const badPage = error?.code === 'VALIDATION_ERROR' && page > 1;
  const lastPage = data?.pagination.totalPages ?? 1;
  const overshoot =
    settled && data && data.items.length === 0 && data.pagination.total > 0 && page > 1;
  useEffect(() => {
    if (overshoot) navigate(`/orders${buildSearch(lastPage)}`, { replace: true });
    else if (badPage) navigate('/orders', { replace: true });
  }, [overshoot, badPage, lastPage, navigate]);

  useEffect(() => {
    if (previousPage.current === page) return;
    previousPage.current = page;
    headingRef.current?.focus();
    window.scrollTo?.({ top: 0 });
  }, [page]);

  useEffect(() => {
    if (error?.code === 'TOO_MANY_REQUESTS') {
      const seconds = Number(error.details?.retryAfterSeconds);
      countdown.start(Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : 60);
    }
    // countdown.start ổn định theo `useCallback`; chỉ phản ứng khi có lỗi mới.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  const reload = () => setAttempt((n) => n + 1);
  const hasData = data !== null;
  const loading = !hasData && !error;
  const total = data?.pagination.total;
  const rateLimited = error?.code === 'TOO_MANY_REQUESTS';
  const waiting = rateLimited && countdown.state === 'running';
  const fetching = hasData && !current;
  const goTo = (next) => navigate(`/orders${buildSearch(next)}`);
  const hardError = error && !hasData && !rateLimited && !badPage;

  return (
    <section>
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="font-display text-title font-semibold outline-none md:text-display"
      >
        Đơn của tôi
      </h1>
      {hasData && <p className="text-small text-ink-muted">{total} đơn</p>}
      <p className="mt-1 text-small text-ink-muted">
        Các đơn chưa thanh toán trực tuyến. Cửa hàng sẽ liên hệ theo số điện thoại bạn cung cấp.
      </p>

      {error && hasData && !rateLimited && !badPage && (
        <Alert variant="danger" role="alert" className="mt-4">
          {LOAD_ERROR}{' '}
          <button type="button" onClick={reload} className="font-semibold underline">
            Thử lại
          </button>
        </Alert>
      )}
      {rateLimited && (
        <Alert variant="warning" role="status" className="mt-4">
          Bạn thao tác quá nhanh, thử lại sau {countdown.remainingSeconds} giây.{' '}
          <Button
            variant="secondary"
            className="ml-2"
            softDisabled={waiting}
            onClick={waiting ? undefined : reload}
          >
            Thử lại
          </Button>
        </Alert>
      )}

      {loading && (
        <div
          aria-busy="true"
          className="mt-6 divide-y divide-line rounded-lg border border-line bg-surface"
        >
          <p role="status" className="sr-only">
            Đang tải đơn hàng
          </p>
          {[0, 1, 2, 3, 4].map((n) => (
            <div key={n} className="flex items-center justify-between gap-4 p-4">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-5 w-20" />
            </div>
          ))}
        </div>
      )}

      {hardError && (
        <div className="mt-10 flex flex-col items-center gap-3 text-center">
          <WifiOff size={40} aria-hidden="true" className="text-ink-subtle" />
          <p className="text-body">{LOAD_ERROR}</p>
          <Button onClick={reload}>Thử lại</Button>
        </div>
      )}

      {hasData && total === 0 && (
        <div className="mt-6 flex flex-col items-center gap-3 py-12 text-center">
          <ReceiptText size={40} aria-hidden="true" className="text-ink-subtle" />
          <h2 className="text-heading font-semibold">Bạn chưa có đơn hàng nào.</h2>
          <p className="text-small text-ink-muted">Thử đồ rồi đặt hàng, đơn sẽ hiện ở đây.</p>
          <LinkButton to="/try-on">Vào phòng thử đồ</LinkButton>
        </div>
      )}

      {hasData && total > 0 && data.items.length > 0 && (
        <>
          <div
            aria-hidden="true"
            className="mt-6 hidden grid-cols-[140px_1fr_80px_140px_24px] gap-4 px-4 text-caption font-semibold uppercase tracking-wider text-ink-muted md:grid"
          >
            <span>Số đơn</span>
            <span>Thời gian</span>
            <span>Số món</span>
            <span className="text-right">Tổng tiền</span>
            <span />
          </div>
          <ul
            aria-busy={fetching || undefined}
            inert={fetching || undefined}
            className={`mt-2 divide-y divide-line rounded-lg border border-line bg-surface md:mt-1 ${
              fetching ? 'opacity-60' : ''
            }`}
          >
            {data.items.map((order) => (
              <OrderRow key={order.id} order={order} from={location.search} />
            ))}
          </ul>
          <Pagination pagination={data.pagination} onPage={goTo} busy={fetching} />
          <p role="status" className="sr-only">
            {settled
              ? `Hiển thị ${data.items.length} đơn, trang ${page} trên ${data.pagination.totalPages}`
              : ''}
          </p>
        </>
      )}
    </section>
  );
}
