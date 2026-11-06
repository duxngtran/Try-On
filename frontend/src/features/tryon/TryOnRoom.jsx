import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { PackageX, Shirt } from 'lucide-react';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { CategoryChips } from './CategoryChips.jsx';
import { ProductImageView } from './ProductImageView.jsx';
import { ArrowButton, NavNotices } from './ProductNav.jsx';
import {
  EmptyStore,
  InfoSkeleton,
  ProductInfo,
  RoomNotices,
  StageIdle,
  StageNote,
} from './RoomParts.jsx';
import { SHIMMER, StageFrame } from './StageFrame.jsx';
import { MessageOverlay } from './StageOverlay.jsx';
import { ANNOUNCE_DWELL_MS } from './tryonConfig.js';
import { describeOverlay } from './tryonStates.js';
import { useCategories } from './useCatalog.js';
import { useImageCache } from './useImageCache.js';
import { useArrowKeys, useSwipe } from './useNavInput.js';
import { useNeighbors } from './useNeighbors.js';
import { useProductImage } from './useProductImage.js';
import { useProductNavigation } from './useProductNavigation.js';

const END_MESSAGE = 'Đây là sản phẩm cuối của danh mục';

/** "Sản phẩm 3 trên 12: tên, giá" cho vùng aria-live. */
const describeForSpeech = (product, position, total) =>
  `Sản phẩm ${position} trên ${total}: ${product.name}, ${product.priceVnd.toLocaleString('vi-VN')} đồng`;

/**
 * Sân khấu của sản phẩm đang xem: máy trạng thái ảnh, mũi tên, vuốt, việc nền (tải trước ảnh liền kề, generate
 * trước) và thông báo cho trình đọc màn hình. Được mount lại (`key`) mỗi khi đổi sản phẩm, nên timer, request và poll
 * của sản phẩm trước bị hủy hết (US-06 R7).
 */
function ProductStage({
  product,
  nav,
  tryonState,
  refreshState,
  onGate,
  announce,
  onOtherCategory,
  cache,
  focusRequest,
  cartFocus,
}) {
  const titleId = useId();
  const rootRef = useRef(null);
  const stateRef = useRef(tryonState);
  useEffect(() => {
    stateRef.current = tryonState;
  });
  const getRoom = useCallback(
    () => ({
      generationAvailable: stateRef.current.generation.available,
      prefetchAllowed: stateRef.current.generation.prefetchAllowed,
      quota: stateRef.current.quota,
    }),
    [],
  );
  const onGenerated = useCallback(() => refreshState({ silent: true }), [refreshState]);
  const image = useProductImage(product.id, {
    imageVersion: product.image.version,
    cache,
    getRoom,
    refreshState,
    onGate,
    onGenerated,
  });
  const { phase, long } = image.view;
  const { hasPrev, hasNext, position, total } = nav;

  useNeighbors({
    product,
    prev: nav.prevProduct,
    next: nav.nextProduct,
    ready: phase === 'ready',
    cache,
    getRoom,
    onGenerated,
  });

  const swipe = useSwipe({
    canPrev: hasPrev,
    canNext: hasNext,
    onPrev: nav.prev,
    onNext: nav.next,
    onEdge: (direction) => direction === 'next' && announce(END_MESSAGE),
  });

  // Người mua vừa bấm "Xem sản phẩm tiếp theo": nút đó biến mất, focus sang nút Sau (nếu dùng được) hoặc tên sản phẩm.
  useEffect(() => {
    if (!focusRequest.current) return;
    focusRequest.current = false;
    const next = rootRef.current?.querySelector('[data-nav="next"]:not([aria-disabled="true"])');
    (next ?? document.getElementById(titleId))?.focus();
  }, [focusRequest, titleId]);

  // Đổi sản phẩm bằng phím lúc focus ở nút Thêm vào giỏ: nút mount lại theo `key`, khôi phục focus vào nút của sản phẩm
  // mới thay vì để rơi về body (US-07 AC-13). Đây là khôi phục chứ không tự ý di chuyển focus.
  useEffect(() => {
    if (!cartFocus.current) return;
    cartFocus.current = false;
    rootRef.current?.parentElement?.querySelector('[data-cart-add]')?.focus();
  }, [cartFocus]);

  // Thông báo vị trí một lần sau khi dừng 400 ms, nên lướt nhanh qua 5 sản phẩm chỉ đọc sản phẩm cuối.
  useEffect(() => {
    if (position == null) return undefined;
    const timer = setTimeout(
      () =>
        announce(
          `${describeForSpeech(product, position, total)}${hasNext ? '' : `. ${END_MESSAGE}`}`,
        ),
      ANNOUNCE_DWELL_MS,
    );
    return () => clearTimeout(timer);
  }, [product, position, total, hasNext, announce]);

  // Thông báo một lần cho từng mốc (không đọc từng giây, không lặp lại khối lỗi đã có role="alert").
  useEffect(() => {
    if (phase === 'waiting' && !long) announce(`Đang tạo ảnh bạn mặc ${product.name}`);
    else if (phase === 'waiting' && long) announce('Vẫn đang tạo, có thể lâu hơn một chút');
    else if (phase === 'ready') announce(`Ảnh bạn mặc ${product.name} đã sẵn sàng`);
  }, [phase, long, product.name, announce]);

  const skipDeleted = async () => {
    focusRequest.current = true;
    if (!(await nav.skipGone())) focusRequest.current = false;
  };
  const bouncing =
    swipe.bounce === 'left' ? '-translate-x-4' : swipe.bounce === 'right' ? 'translate-x-4' : '';

  return (
    <>
      <div
        ref={rootRef}
        className="grid grid-cols-[48px_1fr_48px] items-center gap-x-2 gap-y-3 md:col-start-1 md:row-span-2 md:row-start-1 lg:gap-x-4"
      >
        <div
          {...swipe.bind}
          className={`col-span-3 touch-pan-y transition-transform duration-150 motion-reduce:transition-none lg:col-span-1 lg:col-start-2 lg:row-start-1 ${bouncing}`}
        >
          <ProductImageView
            product={product}
            image={image}
            titleId={titleId}
            hasNext={hasNext}
            onOtherCategory={onOtherCategory}
            onNextProduct={skipDeleted}
          />
          <p className="hidden text-center text-caption text-ink-subtle [@media(hover:hover)]:lg:block">
            Phím ← → để chuyển sản phẩm
          </p>
        </div>
        <ArrowButton
          direction="prev"
          enabled={hasPrev}
          busy={nav.moving === 'prev'}
          onClick={nav.prev}
          className="lg:col-start-1 lg:row-start-1 lg:self-center"
        />
        <p aria-hidden="true" className="text-center text-small text-ink-muted lg:hidden">
          {position} / {total}
        </p>
        <ArrowButton
          direction="next"
          enabled={hasNext}
          busy={nav.moving === 'next'}
          onClick={nav.next}
          className="lg:col-start-3 lg:row-start-1 lg:self-center"
        />
      </div>
      <ProductInfo
        product={product}
        titleId={titleId}
        quota={tryonState.quota}
        position={position}
        total={total}
        stageGone={phase === 'overlay' && image.view.overlayId === 'deleted'}
      >
        <NavNotices
          atEnd={!hasNext}
          navError={nav.navError}
          onRetry={nav.retryNav}
          onOtherCategory={onOtherCategory}
        />
      </ProductInfo>
    </>
  );
}

/** Sản phẩm trên URL đã xóa (US-06 E3, S14): báo và cho nút chuyển tiếp, không tự chuyển, không tự sinh ảnh. */
function GoneStage({ nav, onOtherCategory, onSkip }) {
  const overlay = describeOverlay('deleted', { hasNext: nav.hasNextAfterGone });
  return (
    <StageFrame>
      <div className="flex h-full w-full items-start justify-center pt-[22%]">
        <PackageX size={40} aria-hidden="true" className="text-ink-subtle" />
      </div>
      <MessageOverlay
        overlay={overlay}
        onAction={(kind) => (kind === 'nextProduct' ? onSkip() : onOtherCategory())}
      />
    </StageFrame>
  );
}

/**
 * Phòng thử đồ (G4): chip danh mục, sân khấu, thông tin, điều hướng giữa các sản phẩm (US-06). Chỉ mount khi
 * hồ sơ đủ và consent hiệu lực. URL `?category&product` chỉ chứa id và dùng `replace` (D-117).
 */
export function TryOnRoom({ tryonState, refreshState, onGate, announce }) {
  const [params, setParams] = useSearchParams();
  const categoryId = params.get('category');
  const productParam = params.get('product');
  const catalog = useCategories();
  const nav = useProductNavigation(categoryId, productParam);
  const cache = useImageCache();
  const chipsRef = useRef(null);
  const focusRequest = useRef(false);
  const cartFocus = useRef(false); // focus đang ở nút Thêm vào giỏ lúc người mua đổi sản phẩm bằng phím
  const [notice, setNotice] = useState(null); // 'empty' | 'gone': danh mục vừa bị bỏ chọn
  const { reload: reloadCategories } = catalog;

  const handleGate = useCallback(
    (failure) => {
      cache.clear(); // 403/409: xóa mọi ảnh thử đồ khỏi bộ nhớ trang (AC-16)
      onGate(failure);
    },
    [cache, onGate],
  );

  const selectCategory = (category) => {
    if (category.id === categoryId) {
      nav.goFirst?.(); // chọn lại danh mục đang chọn: về sản phẩm đầu
      return;
    }
    setNotice(null);
    setParams({ category: category.id }, { replace: true }); // D-117: Back rời phòng, không lùi từng bước
    announce(`Danh mục ${category.name}, ${category.productCount} sản phẩm`);
  };

  const focusChip = () => {
    const chip = chipsRef.current?.querySelector('[aria-pressed="true"]');
    chip?.scrollIntoView?.({ block: 'center' });
    chip?.focus();
  };

  // Giữ `product` trên URL đúng với sản phẩm đang xem, thay thế mục lịch sử (D-117, R8).
  const wantedProduct = nav.status === 'ready' ? (nav.product?.id ?? nav.goneId ?? null) : null;
  useEffect(() => {
    if (categoryId && wantedProduct && wantedProduct !== productParam) {
      setParams({ category: categoryId, product: wantedProduct }, { replace: true });
    }
  }, [categoryId, wantedProduct, productParam, setParams]);

  // `←` `→` chỉ khi đang ở bố cục phòng có sản phẩm.
  const canNavigate = nav.status === 'ready' && Boolean(nav.product);
  const rememberCartFocus = () => {
    cartFocus.current = Boolean(document.activeElement?.closest?.('[data-cart-add]'));
  };
  useArrowKeys({
    enabled: canNavigate,
    onPrev: () => {
      rememberCartFocus();
      nav.prev?.();
    },
    onNext: () => {
      if (!nav.hasNext) return announce(END_MESSAGE);
      rememberCartFocus();
      return nav.next();
    },
  });
  // Focus chuyển đi nơi khác trong lúc chờ trang kế tải: bỏ yêu cầu khôi phục.
  useEffect(() => {
    const onFocusIn = (event) => {
      if (!event.target.closest?.('[data-cart-add]')) cartFocus.current = false;
    };
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, []);

  // E6, E7: danh mục trống hoặc không còn tồn tại thì làm mới danh sách và bỏ chọn nếu nó đã biến mất.
  const { status } = nav;
  useEffect(() => {
    if (status !== 'empty' && status !== 'gone') return undefined;
    let cancelled = false;
    (async () => {
      const list = await reloadCategories({ silent: true });
      if (cancelled) return;
      if (status === 'gone' || (list && !list.some((c) => c.id === categoryId))) {
        setNotice(status);
        setParams({}, { replace: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, categoryId, reloadCategories, setParams]);

  if (catalog.status === 'loading') {
    return (
      <div aria-busy="true" className="mt-6">
        <p role="status" className="sr-only">
          Đang tải danh mục
        </p>
        <div aria-hidden="true" className="flex gap-2">
          {[80, 96, 72].map((width) => (
            <div key={width} style={{ width }} className={`h-11 rounded-full ${SHIMMER}`} />
          ))}
        </div>
      </div>
    );
  }
  if (catalog.status === 'error') {
    return (
      <div className="mt-6 flex flex-col items-start gap-3">
        <Alert variant="danger" role="alert" className="w-full">
          Không tải được danh mục.
        </Alert>
        <Button onClick={() => reloadCategories()}>Thử lại</Button>
      </div>
    );
  }
  if (catalog.categories.length === 0) return <EmptyStore />;

  let stage;
  let info = null;
  if (nav.status === 'idle') {
    stage = notice === 'gone' ? <StageGone /> : notice === 'empty' ? <StageEmpty /> : <StageIdle />;
  } else if (nav.status === 'loading') {
    stage = (
      <>
        <div className={`h-full w-full ${SHIMMER}`} />
        <p role="status" className="sr-only">
          Đang tải sản phẩm
        </p>
      </>
    );
    info = <InfoSkeleton />;
  } else if (nav.status === 'empty') {
    stage = <StageEmpty />;
  } else if (nav.status === 'gone') {
    stage = <StageGone />;
  } else if (nav.status === 'error') {
    stage = (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6">
        <Alert variant="danger" role="alert" className="w-full">
          Không tải được sản phẩm. Vui lòng thử lại.
        </Alert>
        <Button onClick={nav.retry}>Thử lại</Button>
      </div>
    );
  } else if (!nav.product) {
    stage = (
      <GoneStage
        nav={nav}
        onOtherCategory={focusChip}
        onSkip={async () => {
          focusRequest.current = true;
          if (!(await nav.skipGone())) focusRequest.current = false;
        }}
      />
    );
  }

  return (
    <div className="mt-6">
      <RoomNotices generation={tryonState.generation} quota={tryonState.quota} />
      <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2 md:grid-rows-[auto_1fr] md:gap-8">
        <div className="min-w-0 md:col-start-2 md:row-start-1">
          <CategoryChips
            categories={catalog.categories}
            selectedId={categoryId}
            onSelect={selectCategory}
            busy={nav.status === 'loading'}
            chipsRef={chipsRef}
          />
        </div>
        {nav.status === 'ready' && nav.product ? (
          <ProductStage
            key={nav.product.id}
            product={nav.product}
            nav={nav}
            tryonState={tryonState}
            refreshState={refreshState}
            onGate={handleGate}
            announce={announce}
            onOtherCategory={focusChip}
            cache={cache}
            focusRequest={focusRequest}
            cartFocus={cartFocus}
          />
        ) : (
          <>
            <div className="md:col-start-1 md:row-span-2 md:row-start-1">
              {stage?.type === GoneStage ? (
                stage
              ) : (
                <StageFrame busy={nav.status === 'loading'}>{stage}</StageFrame>
              )}
            </div>
            {info}
          </>
        )}
      </div>
    </div>
  );
}

function StageEmpty() {
  return (
    <StageNote icon={Shirt} title="Danh mục này chưa có sản phẩm.">
      Hãy chọn danh mục khác.
    </StageNote>
  );
}

function StageGone() {
  return (
    <div className="flex h-full w-full items-center justify-center px-4">
      <Alert variant="warning" role="alert" className="w-full">
        Danh mục không còn tồn tại.
      </Alert>
    </div>
  );
}
