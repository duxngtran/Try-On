import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Shirt } from 'lucide-react';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { CategoryChips } from './CategoryChips.jsx';
import { ProductImageView } from './ProductImageView.jsx';
import {
  EmptyStore,
  InfoSkeleton,
  ProductInfo,
  RoomNotices,
  StageIdle,
  StageNote,
} from './RoomParts.jsx';
import { SHIMMER, StageFrame } from './StageFrame.jsx';
import { useCategories, useFirstProduct } from './useCatalog.js';
import { useProductImage } from './useProductImage.js';

/** Sân khấu của sản phẩm đang xem: chạy máy trạng thái ảnh và hiện thông báo cho trình đọc màn hình. */
function ProductStage({ product, tryonState, refreshState, onGate, announce, onOtherCategory }) {
  const titleId = useId();
  const stateRef = useRef(tryonState);
  useEffect(() => {
    stateRef.current = tryonState;
  });
  const getRoom = useCallback(
    () => ({
      generationAvailable: stateRef.current.generation.available,
      quota: stateRef.current.quota,
    }),
    [],
  );
  const image = useProductImage(product.id, {
    getRoom,
    refreshState,
    onGate,
    onGenerated: () => refreshState({ silent: true }),
  });
  const { phase, long } = image.view;

  // Thông báo một lần cho từng mốc (không đọc từng giây, không lặp lại khối lỗi đã có role="alert").
  useEffect(() => {
    if (phase === 'waiting' && !long) announce(`Đang tạo ảnh bạn mặc ${product.name}`);
    else if (phase === 'waiting' && long) announce('Vẫn đang tạo, có thể lâu hơn một chút');
    else if (phase === 'ready') announce(`Ảnh bạn mặc ${product.name} đã sẵn sàng`);
  }, [phase, long, product.name, announce]);

  return (
    <>
      <div className="md:col-start-1 md:row-span-2 md:row-start-1">
        <ProductImageView
          product={product}
          image={image}
          titleId={titleId}
          onOtherCategory={onOtherCategory}
        />
      </div>
      <ProductInfo product={product} titleId={titleId} quota={tryonState.quota} />
    </>
  );
}

/**
 * Phòng thử đồ (G4): chip danh mục, sân khấu, thông tin. Chỉ mount khi hồ sơ đủ và consent hiệu lực.
 * Điều hướng giữa các sản phẩm (mũi tên, vuốt, phím) thuộc US-06, chưa có ở đây.
 */
export function TryOnRoom({ tryonState, refreshState, onGate, announce }) {
  const [params, setParams] = useSearchParams();
  const categoryId = params.get('category');
  const catalog = useCategories();
  const first = useFirstProduct(categoryId);
  const chipsRef = useRef(null);
  const [notice, setNotice] = useState(null); // 'empty' | 'gone': danh mục vừa bị bỏ chọn
  const { reload: reloadCategories } = catalog;

  const selectCategory = (category) => {
    if (category.id === categoryId) return; // đang ở sản phẩm đầu: không gọi lại
    setNotice(null);
    setParams({ category: category.id }, { replace: true }); // D-117: Back rời phòng, không lùi từng bước
    announce(`Danh mục ${category.name}, ${category.productCount} sản phẩm`);
  };

  const focusChip = () => {
    const chip = chipsRef.current?.querySelector('[aria-pressed="true"]');
    chip?.scrollIntoView?.({ block: 'center' });
    chip?.focus();
  };

  // E6, E7: danh mục trống hoặc không còn tồn tại thì làm mới danh sách và bỏ chọn nếu nó đã biến mất.
  const { status } = first;
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
  if (first.status === 'idle') {
    stage = notice === 'gone' ? <StageGone /> : notice === 'empty' ? <StageEmpty /> : <StageIdle />;
  } else if (first.status === 'loading') {
    stage = (
      <>
        <div className={`h-full w-full ${SHIMMER}`} />
        <p role="status" className="sr-only">
          Đang tải sản phẩm
        </p>
      </>
    );
    info = <InfoSkeleton />;
  } else if (first.status === 'empty') {
    stage = <StageEmpty />;
  } else if (first.status === 'gone') {
    stage = <StageGone />;
  } else if (first.status === 'error') {
    stage = (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6">
        <Alert variant="danger" role="alert" className="w-full">
          Không tải được sản phẩm. Vui lòng thử lại.
        </Alert>
        <Button onClick={first.retry}>Thử lại</Button>
      </div>
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
            busy={first.status === 'loading'}
            chipsRef={chipsRef}
          />
        </div>
        {first.status === 'ready' ? (
          <ProductStage
            key={first.product.id}
            product={first.product}
            tryonState={tryonState}
            refreshState={refreshState}
            onGate={onGate}
            announce={announce}
            onOtherCategory={focusChip}
          />
        ) : (
          <>
            <div className="md:col-start-1 md:row-span-2 md:row-start-1">
              <StageFrame busy={first.status === 'loading'}>{stage}</StageFrame>
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
