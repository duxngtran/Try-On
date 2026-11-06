import { Info, Shirt, WifiOff } from 'lucide-react';
import { Link } from 'react-router';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { Silhouette } from '../../components/Silhouette.jsx';
import { AddToCartButton } from '../cart/AddToCartButton.jsx';
import { LOW_QUOTA_THRESHOLD } from './tryonConfig.js';
import {
  formatPriceVnd,
  formatResetMoment,
  lowQuotaPeriod,
  pickQuotaReset,
} from './tryonFormat.js';
import { SHIMMER, StageFrame } from './StageFrame.jsx';

/** Skeleton lúc tải `/state` lần đầu: không hiện cổng nào trước khi biết kết quả (tránh nháy). */
export function RoomSkeleton() {
  return (
    <div
      aria-busy="true"
      className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2 md:grid-rows-[auto_1fr] md:gap-8"
    >
      <p role="status" className="sr-only">
        Đang tải phòng thử đồ
      </p>
      <div aria-hidden="true" className="flex gap-2 md:col-start-2 md:row-start-1">
        {[80, 96, 72].map((width) => (
          <div key={width} style={{ width }} className={`h-11 shrink-0 rounded-full ${SHIMMER}`} />
        ))}
      </div>
      <div aria-hidden="true" className="md:col-start-1 md:row-span-2 md:row-start-1">
        <StageFrame>
          <div className={`h-full w-full ${SHIMMER}`} />
        </StageFrame>
      </div>
      <InfoSkeleton />
    </div>
  );
}

export function InfoSkeleton() {
  return (
    <div aria-hidden="true" className="space-y-3 md:col-start-2 md:row-start-2 md:self-start">
      <div className={`h-6 w-3/4 rounded-md ${SHIMMER}`} />
      <div className={`h-4 w-1/3 rounded-md ${SHIMMER}`} />
      <div className={`h-6 w-1/4 rounded-md ${SHIMMER}`} />
    </div>
  );
}

/** Lỗi tải `/state` (0b): Error state kèm Thử lại. */
export function RoomError({ onRetry, retrying = false }) {
  return (
    <div className="mt-10 flex flex-col items-center gap-3 text-center">
      <WifiOff size={40} aria-hidden="true" className="text-ink-subtle" />
      <p role="alert" className="max-w-sm text-body text-ink-muted">
        Không thể tải phòng thử đồ. Vui lòng kiểm tra mạng và thử lại.
      </p>
      <Button onClick={onRetry} loading={retrying} loadingText="Đang thử lại…">
        Thử lại
      </Button>
    </div>
  );
}

/** Cửa hàng trống G3 (E5). */
export function EmptyStore() {
  return (
    <section
      aria-labelledby="empty-store-title"
      className="mx-auto mt-10 flex max-w-sm flex-col items-center gap-3 text-center"
    >
      <Shirt size={40} aria-hidden="true" className="text-ink-subtle" />
      <h2 id="empty-store-title" className="font-display text-title font-semibold">
        Cửa hàng chưa có sản phẩm để thử.
      </h2>
      <p className="text-small text-ink-muted">Vui lòng quay lại sau.</p>
      <Link
        to="/"
        className="inline-flex h-11 items-center rounded-md border border-line-strong bg-surface px-5 text-small font-semibold text-ink hover:bg-surface-muted"
      >
        Về trang chủ
      </Link>
    </section>
  );
}

/** Nội dung khung khi chưa chọn danh mục (S0): hình trang trí, ẩn với trình đọc màn hình. */
export function StageIdle() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center">
      <Silhouette className="h-1/2" />
      <div>
        <p className="text-heading font-semibold text-ink">Chọn một danh mục</p>
        <p className="mt-1 text-small text-ink-muted">Bạn sẽ thấy mình mặc thử sản phẩm ở đây.</p>
      </div>
    </div>
  );
}

/** Thông tin sản phẩm: hiện ngay, không chờ API ảnh (US-06 §4.1.2), kể cả khi ảnh lỗi. */
export function ProductInfo({ product, titleId, quota, position, total, children }) {
  return (
    <div className="min-w-0 space-y-1 md:col-start-2 md:row-start-2 md:self-start">
      <h2
        id={titleId}
        tabIndex={-1}
        title={product.name}
        className="line-clamp-2 font-display text-heading font-semibold focus:outline-none md:min-h-16 md:text-title"
      >
        {product.name}
      </h2>
      <p className="text-small text-ink-muted">{product.category.name}</p>
      <p className="text-heading font-semibold">{formatPriceVnd(product.priceVnd)}</p>
      {position != null && total != null && (
        <>
          <p aria-hidden="true" className="hidden text-small text-ink-muted lg:block">
            {position} / {total}
          </p>
          <p className="sr-only">
            Sản phẩm {position} trên {total}
          </p>
        </>
      )}
      {/* Ngay dưới giá ở mọi cỡ màn hình (D-159): vị trí cố định theo giá nên không nhảy khi các thông báo bên dưới đổi. */}
      <AddToCartButton product={product} />
      {quota && quota.remaining > 0 && quota.remaining <= LOW_QUOTA_THRESHOLD && (
        <Alert variant="info" role="group" className="mt-3">
          <p>
            Bạn còn {quota.remaining} lượt tạo ảnh {lowQuotaPeriod(quota)}.
          </p>
          <p className="mt-1 text-ink-muted">
            Ảnh tạo sẵn cho sản phẩm kế tiếp cũng được tính vào lượt.
          </p>
        </Alert>
      )}
      {children}
    </div>
  );
}

/** Dải thông báo ở cấp phòng: tạm dừng và hết lượt. Không đóng được, không nêu lý do hay số tiền. */
export function RoomNotices({ generation, quota }) {
  const exhausted = quota.remaining === 0 && quota.held === 0;
  const reset = exhausted ? formatResetMoment(pickQuotaReset(quota).resetsAt) : null;
  if (generation.available && !exhausted) return null;
  return (
    <div className="mt-4 space-y-3">
      {!generation.available && (
        <Alert variant="warning" role="status">
          Tính năng tạo ảnh đang tạm dừng. Bạn vẫn xem được các ảnh đã tạo.
        </Alert>
      )}
      {exhausted && (
        <Alert variant="warning" role="status">
          Bạn đã dùng hết lượt tạo ảnh.{reset ? ` Lượt mới có sau ${reset}.` : ''} Các ảnh đã tạo
          vẫn xem được.
        </Alert>
      )}
    </div>
  );
}

/** Dòng nhỏ có icon cho trạng thái trống. */
export function StageNote({ icon: Icon = Info, title, children }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-6 text-center">
      <Icon size={40} aria-hidden="true" className="text-ink-subtle" />
      <p className="text-heading font-semibold text-ink">{title}</p>
      {children && <p className="text-small text-ink-muted">{children}</p>}
    </div>
  );
}
