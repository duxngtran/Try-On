import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import {
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  SearchX,
  Shirt,
  Trash2,
  WifiOff,
} from 'lucide-react';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { Select } from '../../components/Select.jsx';
import { Spinner } from '../../components/Spinner.jsx';
import { usePageTitle } from '../../hooks/usePageTitle.js';
import { useAdminToast } from './AdminToast.jsx';
import { DeleteProductModal } from './DeleteProductModal.jsx';
import { ProductThumb } from './ProductThumb.jsx';
import { buildListSearch, formatPriceVnd, normalizeListParams } from './productSchemas.js';
import { useCategories } from './useCategories.js';
import { useProducts } from './useProducts.js';

const ROW_GRID = 'md:grid md:grid-cols-[64px_1fr_140px_112px_auto] md:items-center md:gap-4';

function ProductSkeleton() {
  return (
    <ul aria-busy="true" className="divide-y divide-line rounded-lg border border-line bg-surface">
      {[0, 1, 2, 3, 4].map((i) => (
        <li key={i} className={`flex flex-col gap-3 p-4 ${ROW_GRID}`}>
          <div className="h-14 w-14 animate-pulse rounded-md bg-surface-muted motion-reduce:animate-none md:h-16 md:w-16" />
          <div className="space-y-2">
            <div className="h-5 w-3/5 animate-pulse rounded-sm bg-surface-muted motion-reduce:animate-none" />
            <div className="h-4 w-2/5 animate-pulse rounded-sm bg-surface-muted motion-reduce:animate-none md:hidden" />
          </div>
          <div className="hidden h-4 w-24 animate-pulse rounded-sm bg-surface-muted motion-reduce:animate-none md:block" />
          <div className="h-5 w-20 animate-pulse rounded-sm bg-surface-muted motion-reduce:animate-none" />
          <div className="grid grid-cols-2 gap-2 md:flex">
            <div className="h-11 animate-pulse rounded-md bg-surface-muted motion-reduce:animate-none md:w-24" />
            <div className="h-11 animate-pulse rounded-md bg-surface-muted motion-reduce:animate-none md:w-24" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function ProductRow({ product, from, onDelete }) {
  const { name, priceVnd, category, image } = product;
  return (
    <li className={`flex flex-col gap-3 p-4 md:hover:bg-surface-muted ${ROW_GRID}`}>
      <div className="flex gap-3 md:contents">
        <ProductThumb url={image.url} name={name} />
        <div className="min-w-0 flex-1 md:contents">
          <p title={name} className="line-clamp-2 break-words font-semibold md:min-w-0">
            {name}
          </p>
          <p className="text-small text-ink-muted">{category.name}</p>
          <p
            className="font-semibold tabular-nums"
            aria-label={`${new Intl.NumberFormat('vi-VN').format(priceVnd)} đồng`}
          >
            {formatPriceVnd(priceVnd)}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 md:flex">
        <Link
          to={`/admin/products/${product.id}/edit`}
          state={{ from }}
          aria-label={`Sửa sản phẩm ${name}`}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-line-strong bg-surface px-5 text-small font-semibold text-ink hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          <Pencil size={16} aria-hidden="true" />
          Sửa
        </Link>
        <Button
          variant="ghost"
          onClick={onDelete}
          aria-label={`Xóa sản phẩm ${name}`}
          className="!text-danger"
        >
          <Trash2 size={16} aria-hidden="true" />
          Xóa
        </Button>
      </div>
    </li>
  );
}

function Pagination({ pagination, onPage }) {
  const { page, limit, total, totalPages } = pagination;
  if (totalPages <= 1) return null;
  const first = (page - 1) * limit + 1;
  const last = Math.min(page * limit, total);
  return (
    <nav aria-label="Phân trang" className="mt-4">
      <div className="flex items-center justify-between gap-3">
        <Button variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft size={16} aria-hidden="true" />
          Trước
        </Button>
        <p aria-live="polite" className="text-small text-ink-muted">
          Trang {page} / {totalPages}
        </p>
        <Button variant="secondary" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          Sau
          <ChevronRight size={16} aria-hidden="true" />
        </Button>
      </div>
      <p className="mt-2 text-center text-small text-ink-muted">
        Hiển thị {first}–{last} trên {total} sản phẩm
      </p>
    </nav>
  );
}

/** Trang Sản phẩm `/admin/products` (screens/products.md, US-04). Bộ lọc và trang nằm trên URL (D-61). */
export function ProductsPage() {
  usePageTitle('Sản phẩm');
  const toast = useAdminToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { page, categoryId } = normalizeListParams(searchParams);
  const search = buildListSearch({ page, categoryId });

  const categories = useCategories();
  const { status, data, error, fetching, settled, reload, removeLocal } = useProducts({
    page,
    categoryId,
  });
  const [deleting, setDeleting] = useState(null);
  const headingRef = useRef(null);
  const previousPage = useRef(page);

  // Thông báo do form sản phẩm gửi sang; xóa khỏi history state để tải lại/Back không hiện lại.
  const notice = location.state?.notice;
  useEffect(() => {
    if (!notice) return;
    toast.show(notice.message, notice.variant ?? 'success');
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    headingRef.current?.focus();
  }, [notice, toast, navigate, location.pathname, location.search]);

  // Trang vượt quá tổng số trang (xóa hết dòng của trang cuối): lùi về trang cuối hợp lệ.
  const lastPage = data?.pagination.totalPages ?? 1;
  const overshoot =
    settled && data && data.items.length === 0 && data.pagination.total > 0 && page > 1;
  useEffect(() => {
    if (overshoot)
      navigate(`/admin/products${buildListSearch({ page: lastPage, categoryId })}`, {
        replace: true,
      });
  }, [overshoot, lastPage, categoryId, navigate]);

  const goTo = (next) => {
    navigate(`/admin/products${buildListSearch({ page: 1, categoryId, ...next })}`);
  };

  // Đổi trang: cuộn về đầu và focus vào h1 (không chạy ở lần đầu).
  useEffect(() => {
    if (previousPage.current === page) return;
    previousPage.current = page;
    headingRef.current?.focus();
    window.scrollTo?.({ top: 0 });
  }, [page]);

  const total = data?.pagination.total;
  const ready = status === 'ready';
  const items = data?.items ?? [];
  const knownCategory = !categoryId || categories.categories.some((c) => c.id === categoryId);
  const categoriesReady = categories.status === 'ready';
  const badFilter = status === 'error' && error?.code === 'VALIDATION_ERROR';
  const filtering = Boolean(categoryId);

  const afterDelete = (product) => {
    setDeleting(null);
    removeLocal(product.id);
    toast.show('Đã xóa sản phẩm');
    headingRef.current?.focus();
    reload();
    categories.reload();
  };
  const gone = (message) => {
    setDeleting(null);
    toast.show(message, 'error');
    reload();
  };

  const clearFilter = () => goTo({ categoryId: null });

  return (
    <section>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="font-display text-title font-semibold outline-none md:text-display"
          >
            Sản phẩm
          </h1>
          {ready && (
            <p className="flex items-center gap-2 text-small text-ink-muted">
              {total} sản phẩm
              {fetching && <Spinner label="Đang tải" />}
            </p>
          )}
        </div>
        <Link
          to="/admin/products/new"
          state={{ categoryId: categoryId ?? '', from: search }}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-ink px-5 text-small font-semibold text-ink-inverse hover:bg-[#333] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink sm:w-auto"
        >
          <Plus size={18} aria-hidden="true" />
          Thêm sản phẩm
        </Link>
      </div>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-end">
        <Select
          label="Danh mục"
          className="w-full sm:w-64"
          value={categoryId ?? ''}
          disabled={!categoriesReady || (filtering && !knownCategory)}
          onChange={(event) => goTo({ categoryId: event.target.value || null, page: 1 })}
        >
          <option value="">Tất cả danh mục</option>
          {categories.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          {categoriesReady && filtering && !knownCategory && (
            <option value={categoryId}>Danh mục không còn tồn tại</option>
          )}
        </Select>
        {categories.status === 'loading' && <Spinner label="Đang tải danh mục" />}
        {filtering && (
          <button
            type="button"
            onClick={clearFilter}
            className="h-11 text-left text-small font-semibold text-accent-strong underline hover:text-ink"
          >
            Xóa bộ lọc
          </button>
        )}
      </div>
      {categories.status === 'error' && (
        <p className="mt-2 text-small text-danger" role="alert">
          Không tải được danh mục.{' '}
          <button
            type="button"
            onClick={() => categories.reload({ silent: false })}
            className="font-semibold underline"
          >
            Thử lại
          </button>
        </p>
      )}

      {ready && error && (
        <Alert variant="danger" role="alert" className="mt-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>Không thể tải sản phẩm. Vui lòng kiểm tra mạng và thử lại.</span>
            <button
              type="button"
              onClick={reload}
              className="font-semibold text-accent-strong underline hover:text-ink"
            >
              Thử lại
            </button>
          </div>
        </Alert>
      )}

      <p className="sr-only" aria-live="polite">
        {ready && settled
          ? total
            ? `Hiển thị ${items.length} sản phẩm`
            : 'Không có sản phẩm'
          : ''}
      </p>

      <div className="mt-6">
        {status === 'loading' && (
          <>
            <span role="status" className="sr-only">
              Đang tải sản phẩm
            </span>
            <ProductSkeleton />
          </>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-line bg-surface px-4 py-12 text-center">
            <WifiOff size={40} aria-hidden="true" className="text-ink-subtle" />
            <p role="alert">
              {badFilter
                ? 'Bộ lọc không hợp lệ.'
                : 'Không thể tải sản phẩm. Vui lòng kiểm tra mạng và thử lại.'}
            </p>
            {badFilter ? (
              <Button variant="secondary" onClick={() => navigate('/admin/products')}>
                Xóa bộ lọc
              </Button>
            ) : (
              <Button variant="secondary" onClick={reload}>
                Thử lại
              </Button>
            )}
          </div>
        )}

        {ready && items.length === 0 && !overshoot && (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-line bg-surface px-4 py-12 text-center">
            {filtering ? (
              <>
                <SearchX size={40} aria-hidden="true" className="text-ink-subtle" />
                <h2 className="font-display text-title font-semibold">
                  Không có sản phẩm trong danh mục này
                </h2>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button variant="secondary" onClick={clearFilter}>
                    Xóa bộ lọc
                  </Button>
                  <Link
                    to="/admin/products/new"
                    state={{ categoryId }}
                    className="inline-flex h-11 items-center justify-center rounded-md bg-ink px-5 text-small font-semibold text-ink-inverse hover:bg-[#333]"
                  >
                    Thêm sản phẩm
                  </Link>
                </div>
              </>
            ) : (
              <>
                <Shirt size={40} aria-hidden="true" className="text-ink-subtle" />
                <h2 className="font-display text-title font-semibold">Chưa có sản phẩm</h2>
                <p className="text-ink-muted">Thêm sản phẩm đầu tiên để bắt đầu.</p>
                <Link
                  to="/admin/products/new"
                  className="inline-flex h-11 items-center justify-center rounded-md bg-ink px-5 text-small font-semibold text-ink-inverse hover:bg-[#333]"
                >
                  Thêm sản phẩm
                </Link>
              </>
            )}
          </div>
        )}

        {ready && items.length > 0 && (
          <div
            aria-busy={fetching || undefined}
            className={`overflow-hidden rounded-lg border border-line bg-surface transition-opacity duration-150 motion-reduce:transition-none ${
              fetching ? 'opacity-60' : ''
            }`}
          >
            <div
              aria-hidden="true"
              className="hidden border-b border-line px-4 py-2 text-caption font-semibold uppercase tracking-wider text-ink-muted md:grid md:grid-cols-[64px_1fr_140px_112px_auto] md:gap-4"
            >
              <span className="col-span-2">Sản phẩm</span>
              <span>Danh mục</span>
              <span>Giá</span>
              <span className="w-[180px]" />
            </div>
            <ul inert={fetching} className="divide-y divide-line">
              {items.map((product) => (
                <ProductRow
                  key={product.id}
                  product={product}
                  from={search}
                  onDelete={() => setDeleting(product)}
                />
              ))}
            </ul>
          </div>
        )}

        {ready && data && (
          <Pagination pagination={data.pagination} onPage={(p) => goTo({ page: p })} />
        )}
      </div>

      {deleting && (
        <DeleteProductModal
          key={deleting.id}
          product={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={afterDelete}
          onGone={gone}
        />
      )}
    </section>
  );
}
