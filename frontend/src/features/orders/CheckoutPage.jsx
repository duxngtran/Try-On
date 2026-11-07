import { useEffect, useRef, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { LinkButton } from '../../components/LinkButton.jsx';
import { Skeleton } from '../../components/Skeleton.jsx';
import { TextAreaField } from '../../components/TextAreaField.jsx';
import { TextField } from '../../components/TextField.jsx';
import { useCountdown } from '../../hooks/useCountdown.js';
import { usePageTitle } from '../../hooks/usePageTitle.js';
import { cartApi } from '../cart/cartApi.js';
import { useCart } from '../cart/cartContext.js';
import { formatPriceVnd } from '../cart/cartFormat.js';
import { useCheckoutDraft } from './checkoutDraftContext.js';
import { CheckoutSummary } from './CheckoutSummary.jsx';
import { ordersApi } from './ordersApi.js';
import { ORDER_MESSAGES, normalizeForDisplay, validateRecipient } from './orderSchemas.js';

const FIELDS = ['name', 'phone', 'address'];
const GENERIC_ERROR = 'Chưa đặt được hàng. Vui lòng thử lại.';
const RELOAD_ERROR = 'Chưa đặt được hàng. Vui lòng tải lại trang và thử lại.';
const UNKNOWN_ERROR =
  'Chưa rõ đơn đã được ghi hay chưa. Bấm Thử lại để kiểm tra, sẽ không tạo thêm đơn thứ hai.';

const retrySeconds = (details) => {
  const seconds = Number(details?.retryAfterSeconds);
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : 60;
};

/** Dưới 90 giây hiện giây, từ 90 giây hiện phút làm tròn lên (giới hạn tạo đơn tính theo giờ). */
export const formatWait = (seconds) =>
  seconds < 90 ? `${seconds} giây` : `${Math.ceil(seconds / 60)} phút`;

/** Dòng nào khác bản trước (mới, đổi số lượng, giá, tên) và tên các dòng đã mất. Chỉ để đánh dấu, không tính tiền. */
export function diffCarts(previous, fresh) {
  const before = new Map(previous.items.map((i) => [i.productId, i]));
  const changedIds = new Set();
  for (const item of fresh.items) {
    const old = before.get(item.productId);
    if (
      !old ||
      old.quantity !== item.quantity ||
      old.priceVnd !== item.priceVnd ||
      old.name !== item.name
    ) {
      changedIds.add(item.productId);
    }
  }
  const now = new Set(fresh.items.map((i) => i.productId));
  const removed = previous.items.filter((i) => !now.has(i.productId)).map((i) => i.name);
  return { changedIds, removed };
}

function CheckoutSkeleton() {
  return (
    <div aria-busy="true" className="mt-6 space-y-4">
      <p role="status" className="sr-only">
        Đang tải đơn hàng
      </p>
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

/**
 * Trang đặt hàng `/checkout` (screens/checkout.md, US-08 §4.3, §5). Người mua xác nhận ĐÚNG giỏ vừa xem:
 * `fingerprint` của lần `GET /cart` gần nhất của trang này đi kèm `POST /orders`; không làm mới ngầm (D-158), không tự
 * gửi lại sau `CART_CHANGED` (D-144). Khóa chống đặt trùng sinh một lần và dùng lại cho mọi lần thử (D-145).
 * Dữ liệu form chỉ ở bộ nhớ (`CheckoutDraft`), không bao giờ ghi trình duyệt, URL hay log (R9, AC-17).
 */
export function CheckoutPage() {
  usePageTitle('Đặt hàng');
  const navigate = useNavigate();
  const draft = useCheckoutDraft();
  const { refresh: refreshCart } = useCart();
  const countdown = useCountdown();

  const [view, setView] = useState('loading'); // loading | error | form | empty
  const [cart, setCart] = useState(null);
  const [changedIds, setChangedIds] = useState(() => new Set());
  const [values, setValues] = useState(() => {
    const { name, phone, address } = draft.get();
    return { name, phone, address };
  });
  const [errors, setErrors] = useState({});
  const [alert, setAlert] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const submittingRef = useRef(false);
  const keyRef = useRef(null);
  const headingRef = useRef(null);
  const alertRef = useRef(null);
  const emptyRef = useRef(null);
  const fieldRefs = { name: useRef(null), phone: useRef(null), address: useRef(null) };

  // Mở trang luôn đọc giỏ mới (không dùng bản của /cart) và lấy fingerprint của chính bản này.
  useEffect(() => {
    const controller = new AbortController();
    cartApi
      .getCart({ signal: controller.signal })
      .then((fresh) => {
        if (fresh.lineCount === 0) {
          navigate('/cart', { replace: true });
        } else if (fresh.hasUnavailable) {
          navigate('/cart', { replace: true, state: { notice: 'unavailable' } });
        } else {
          keyRef.current = draft.ensureKey();
          setCart(fresh);
          setView('form');
        }
      })
      .catch((error) => {
        if (error?.code === 'CANCELED') return;
        setView('error');
      });
    return () => controller.abort();
  }, [attempt, draft, navigate]);

  // Focus vào khối vừa xuất hiện do kết quả của hành động (CART_CHANGED, CART_EMPTY).
  const alertKind = alert?.kind;
  const alertId = alert?.id;
  useEffect(() => {
    if (alertKind === 'changed') alertRef.current?.focus();
  }, [alertKind, alertId]);
  useEffect(() => {
    if (view === 'empty') emptyRef.current?.focus();
  }, [view]);

  const locked = countdown.state === 'running';

  const retryLoad = () => {
    setView('loading');
    setAttempt((n) => n + 1);
  };

  const change = (field) => (event) => {
    const next = event.target.value;
    setValues((prev) => ({ ...prev, [field]: next }));
    draft.save({ [field]: next });
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  };

  // Rời ô: hiện lại giá trị đã chuẩn hóa và báo lỗi của ô đó (D-21: cùng bảng case với backend).
  const blur = (field) => () => {
    const shown = normalizeForDisplay(field, values[field]);
    if (shown !== values[field]) {
      setValues((prev) => ({ ...prev, [field]: shown }));
      draft.save({ [field]: shown });
    }
    const result = validateRecipient({ ...values, [field]: shown });
    setErrors((prev) => ({ ...prev, [field]: result.ok ? undefined : result.errors[field] }));
  };

  const focusFirstInvalid = (fieldErrors) => {
    const first = FIELDS.find((f) => fieldErrors[f]);
    if (first) fieldRefs[first].current?.focus();
  };

  async function reloadAfterChange() {
    const previous = cart;
    let fresh;
    try {
      fresh = await cartApi.getCart();
    } catch {
      setAlert({ kind: 'reload', id: Date.now(), text: RELOAD_ERROR });
      return;
    }
    if (fresh.lineCount === 0) {
      draft.clear();
      setView('empty');
      return;
    }
    if (fresh.hasUnavailable) {
      navigate('/cart', { replace: true, state: { notice: 'unavailable' } });
      return;
    }
    const { changedIds: changed, removed } = diffCarts(previous, fresh);
    setCart(fresh);
    setChangedIds(changed);
    setSummaryOpen(true);
    setAlert({
      kind: 'changed',
      id: Date.now(),
      oldTotal: previous.totalVnd,
      newTotal: fresh.totalVnd,
      removed,
    });
  }

  async function submit(event) {
    event.preventDefault();
    if (submittingRef.current || locked) return;
    const checked = validateRecipient(values);
    if (!checked.ok) {
      setErrors(checked.errors);
      focusFirstInvalid(checked.errors);
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setErrors({});
    setAlert(null);
    setUnknown(false);
    setValues(checked.recipient);
    try {
      const order = await ordersApi.place({
        idempotencyKey: keyRef.current,
        cartFingerprint: cart.fingerprint,
        recipient: checked.recipient,
      });
      draft.clear();
      navigate(`/orders/${order.id}`, { replace: true, state: { placed: true } });
      refreshCart();
      return;
    } catch (error) {
      await handleFailure(error);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  async function handleFailure(error) {
    switch (error.code) {
      case 'VALIDATION_ERROR': {
        // Chữ theo field, không dùng message của server (D-119).
        const fieldErrors = {};
        for (const detail of Array.isArray(error.details) ? error.details : []) {
          const field = String(detail.field ?? '').replace(/^recipient\./, '');
          if (FIELDS.includes(field)) fieldErrors[field] = ORDER_MESSAGES[field];
        }
        if (Object.keys(fieldErrors).length > 0) {
          setErrors(fieldErrors);
          focusFirstInvalid(fieldErrors);
        } else {
          setAlert({ kind: 'reload', id: Date.now(), text: RELOAD_ERROR });
        }
        return;
      }
      case 'CART_EMPTY':
        draft.clear();
        setView('empty');
        return;
      case 'CART_HAS_UNAVAILABLE':
        navigate('/cart', { state: { notice: 'unavailable' } });
        return;
      case 'CART_CHANGED':
        await reloadAfterChange();
        return;
      case 'TOO_MANY_REQUESTS': {
        const seconds = retrySeconds(error.details);
        countdown.start(seconds);
        setAlert({ kind: 'rate', id: Date.now(), seconds });
        return;
      }
      case 'NETWORK_ERROR':
        setUnknown(true);
        setAlert({ kind: 'unknown', id: Date.now() });
        return;
      default:
        setAlert({ kind: 'failed', id: Date.now(), text: GENERIC_ERROR });
    }
  }

  const noticeId = 'checkout-payment-note';
  const label = locked
    ? `Thử lại sau ${formatWait(countdown.remainingSeconds)}`
    : unknown
      ? 'Thử lại'
      : 'Xác nhận đặt hàng';

  return (
    <section>
      <Link
        to="/cart"
        className="inline-flex h-11 items-center text-small font-semibold text-accent-strong underline hover:text-ink"
      >
        <span aria-hidden="true">←&nbsp;</span>Quay lại giỏ hàng
      </Link>
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="font-display text-title font-semibold outline-none md:text-display"
      >
        Đặt hàng
      </h1>

      {view === 'loading' && <CheckoutSkeleton />}

      {view === 'error' && (
        <div className="mt-10 flex flex-col items-center gap-3 text-center">
          <WifiOff size={40} aria-hidden="true" className="text-ink-subtle" />
          <p className="text-body">Không thể tải đơn hàng. Vui lòng kiểm tra mạng và thử lại.</p>
          <Button onClick={retryLoad}>Thử lại</Button>
        </div>
      )}

      {view === 'empty' && (
        <Alert ref={emptyRef} tabIndex={-1} variant="info" role="alert" className="mt-6 flex-wrap">
          <p>Giỏ hàng đang trống. Nếu bạn vừa đặt hàng, hãy xem ở Đơn của tôi.</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <LinkButton to="/orders">Xem Đơn của tôi</LinkButton>
            <Link
              to="/cart"
              className="inline-flex h-11 items-center text-small font-semibold text-accent-strong underline hover:text-ink"
            >
              Về giỏ hàng
            </Link>
          </div>
        </Alert>
      )}

      {view === 'form' && cart && (
        <>
          <div className="mt-4 flex flex-col gap-3">
            {alert?.kind === 'changed' && (
              <Alert ref={alertRef} tabIndex={-1} variant="warning" role="alert">
                <p className="font-bold">Giỏ hàng vừa thay đổi</p>
                <p>Vui lòng kiểm tra lại rồi xác nhận.</p>
                {alert.oldTotal !== alert.newTotal && (
                  <p className="tabular-nums">
                    Tổng tiền: {formatPriceVnd(alert.oldTotal)} → {formatPriceVnd(alert.newTotal)}
                  </p>
                )}
                {alert.removed.length > 0 && (
                  <p className="text-small">Đã bỏ khỏi giỏ: {alert.removed.join(', ')}</p>
                )}
              </Alert>
            )}
            {alert?.kind === 'rate' && locked && (
              <Alert variant="warning" role="status">
                Bạn thao tác quá nhanh, thử lại sau {formatWait(alert.seconds)} nữa.
              </Alert>
            )}
            {alert?.kind === 'unknown' && (
              <Alert variant="warning" role="alert">
                <p>{UNKNOWN_ERROR}</p>
                <Link
                  to="/orders"
                  className="mt-1 inline-flex h-11 items-center text-small font-semibold text-accent-strong underline hover:text-ink"
                >
                  Xem Đơn của tôi
                </Link>
              </Alert>
            )}
            {alert?.kind === 'failed' && (
              <Alert variant="danger" role="alert">
                {alert.text}
              </Alert>
            )}
            {alert?.kind === 'reload' && (
              <Alert variant="danger" role="alert">
                <p>{alert.text}</p>
                <Button
                  variant="secondary"
                  className="mt-2"
                  onClick={() => window.location.reload()}
                >
                  Tải lại trang
                </Button>
              </Alert>
            )}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="lg:col-span-5 lg:col-start-8 lg:row-start-1 lg:self-start lg:sticky lg:top-20">
              <CheckoutSummary
                cart={cart}
                changedIds={changedIds}
                open={summaryOpen}
                onToggle={() => setSummaryOpen((v) => !v)}
              />
            </div>

            <form
              noValidate
              onSubmit={submit}
              className="flex flex-col gap-5 lg:col-span-7 lg:col-start-1 lg:row-start-1"
            >
              <fieldset className="flex flex-col gap-5">
                <legend className="mb-3 text-heading font-semibold">Thông tin nhận hàng</legend>
                <TextField
                  ref={fieldRefs.name}
                  label="Họ tên người nhận (bắt buộc)"
                  name="name"
                  type="text"
                  autoComplete="name"
                  autoCapitalize="words"
                  spellCheck={false}
                  value={values.name}
                  error={errors.name}
                  readOnly={submitting}
                  onChange={change('name')}
                  onBlur={blur('name')}
                />
                <TextField
                  ref={fieldRefs.phone}
                  label="Số điện thoại (bắt buộc)"
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  spellCheck={false}
                  hint="Số di động Việt Nam, ví dụ 0912 345 678. Cửa hàng sẽ liên hệ qua số này, hãy kiểm tra kỹ."
                  value={values.phone}
                  error={errors.phone}
                  readOnly={submitting}
                  onChange={change('phone')}
                  onBlur={blur('phone')}
                />
                <TextAreaField
                  ref={fieldRefs.address}
                  label="Địa chỉ nhận hàng (bắt buộc)"
                  name="address"
                  autoComplete="street-address"
                  enterKeyHint="done"
                  hint="Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành phố."
                  value={values.address}
                  error={errors.address}
                  readOnly={submitting}
                  onChange={change('address')}
                  onBlur={blur('address')}
                />
              </fieldset>

              <Alert variant="info" role="group" id={noticeId} aria-label="Lưu ý về thanh toán">
                <p className="font-bold">Chưa thanh toán trực tuyến.</p>
                <p>Cửa hàng sẽ liên hệ theo số điện thoại bạn cung cấp.</p>
                <p className="text-ink-muted">
                  Họ tên, số điện thoại và địa chỉ chỉ được lưu trong đơn hàng này, không lưu vào hồ
                  sơ của bạn.
                </p>
              </Alert>

              <div>
                <p className="mb-2 flex items-center gap-1.5 text-heading font-semibold tabular-nums">
                  Tổng tiền: {formatPriceVnd(cart.totalVnd)}
                </p>
                <Button
                  type="submit"
                  size="lg"
                  fullWidth
                  busy={submitting}
                  softDisabled={locked && !submitting}
                  loadingText="Đang gửi đơn…"
                  aria-describedby={noticeId}
                  className="md:max-w-sm"
                >
                  {label}
                </Button>
              </div>
            </form>
          </div>
        </>
      )}
    </section>
  );
}
