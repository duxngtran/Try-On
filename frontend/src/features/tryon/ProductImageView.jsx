import { useEffect, useRef, useState } from 'react';
import { ImageOff, PackageX, WifiOff } from 'lucide-react';
import { StageFrame } from './StageFrame.jsx';
import { MessageOverlay, WaitOverlay } from './StageOverlay.jsx';
import { describeOverlay } from './tryonStates.js';

const LAYER = 'absolute inset-0 h-full w-full object-contain transition-opacity duration-300';

/**
 * Sân khấu của một sản phẩm: ảnh trải phẳng (nhãn "ẢNH SẢN PHẨM"), ảnh thử đồ cross-fade 300ms khi sẵn sàng,
 * lớp phủ chờ/lỗi và dải mất kết nối. `image` là kết quả của `useProductImage`. Khung luôn 3:4 cố định.
 */
export function ProductImageView({ product, image, titleId, onOtherCategory }) {
  const { view, retry, recheck, reloadImage, onImageError, onImageLoad } = image;
  const [flatFailed, setFlatFailed] = useState({ productId: null });
  const [loadedFor, setLoadedFor] = useState(null);
  const focusWait = useRef(false);

  const tryOnImage = view.phase === 'ready' ? view.image : null;
  const deleted = view.phase === 'overlay' && view.overlayId === 'deleted';
  // Ảnh thử đồ vừa rời màn hình (đổi trạng thái): lần sau hiện lại phải cross-fade từ đầu.
  if (!tryOnImage && loadedFor !== null) setLoadedFor(null);
  const tryOnShown = Boolean(tryOnImage) && loadedFor === product.id;
  const flatBroken = flatFailed.productId === product.id;

  useEffect(() => {
    if (view.phase !== 'waiting' && view.phase !== 'resolving') focusWait.current = false;
  }, [view.phase]);

  const act = (kind) => {
    if (kind === 'otherCategory') return onOtherCategory();
    focusWait.current = true; // nút vừa bấm sẽ biến mất, focus sang khối chờ mới
    if (kind === 'retry') return retry();
    if (kind === 'recheck') return recheck();
    return reloadImage();
  };

  const overlay =
    view.phase === 'overlay' ? describeOverlay(view.overlayId, view.overlayData ?? {}) : null;

  return (
    <StageFrame
      labelledBy={titleId}
      showAiLabel={view.phase === 'ready'}
      busy={view.phase === 'waiting' || view.phase === 'resolving'}
    >
      {deleted ? (
        <div className="flex h-full w-full items-start justify-center pt-[22%]">
          <PackageX size={40} aria-hidden="true" className="text-ink-subtle" />
        </div>
      ) : flatBroken ? (
        <div
          role="img"
          aria-label={`Ảnh sản phẩm ${product.name}, trải phẳng`}
          className="flex h-full w-full items-start justify-center pt-[22%]"
        >
          <ImageOff size={24} aria-hidden="true" className="text-ink-subtle" />
        </div>
      ) : (
        <img
          src={product.image.url}
          alt={`Ảnh sản phẩm ${product.name}, trải phẳng`}
          draggable="false"
          onError={() => setFlatFailed({ productId: product.id })}
          className={`${LAYER} ${tryOnShown ? 'opacity-0' : 'opacity-100'}`}
        />
      )}
      {!deleted && !flatBroken && !tryOnShown && (
        <span className="absolute left-2 top-2 rounded-sm border border-line bg-surface px-2 py-0.5 text-caption font-semibold uppercase tracking-wider text-ink-muted">
          Ảnh sản phẩm
        </span>
      )}
      {tryOnImage && (
        <img
          src={tryOnImage.url}
          alt={`Ảnh bạn mặc ${product.name}, do AI tạo`}
          draggable="false"
          onLoad={() => {
            setLoadedFor(product.id);
            onImageLoad();
          }}
          onError={onImageError}
          className={`${LAYER} ${tryOnShown ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
      {view.offline && (
        <p
          role="status"
          className="absolute inset-x-0 top-0 z-10 flex items-center gap-2 border-b border-warning bg-warning-soft px-3 py-2 text-small text-ink"
        >
          <WifiOff size={16} aria-hidden="true" className="shrink-0 text-warning" />
          Mất kết nối. Đang thử lại khi có mạng…
        </p>
      )}
      {(view.phase === 'resolving' || view.phase === 'waiting') && (
        <WaitOverlay phase={view.phase} long={view.long} focusRequest={focusWait} />
      )}
      {overlay && <MessageOverlay overlay={overlay} onAction={act} />}
    </StageFrame>
  );
}
