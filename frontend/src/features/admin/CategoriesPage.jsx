import { useEffect, useRef, useState } from 'react';
import { Pencil, Plus, Tags, Trash2, WifiOff } from 'lucide-react';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { usePageTitle } from '../../hooks/usePageTitle.js';
import { useAdminToast } from './AdminToast.jsx';
import { CategoryFormModal } from './CategoryFormModal.jsx';
import { DeleteCategoryModal } from './DeleteCategoryModal.jsx';
import { useCategories } from './useCategories.js';

const ROW_GRID = 'md:grid md:grid-cols-[1fr_140px_auto] md:items-center md:gap-4';
const HIGHLIGHT_MS = 2000;

function CategorySkeleton() {
  return (
    <ul aria-busy="true" className="divide-y divide-line rounded-lg border border-line bg-surface">
      {[0, 1, 2].map((i) => (
        <li key={i} className={`flex flex-col gap-3 p-4 ${ROW_GRID}`}>
          <div className="h-5 w-2/5 animate-pulse rounded-sm bg-surface-muted motion-reduce:animate-none" />
          <div className="h-4 w-1/5 animate-pulse rounded-sm bg-surface-muted motion-reduce:animate-none" />
          <div className="h-11 w-full animate-pulse rounded-md bg-surface-muted motion-reduce:animate-none md:w-40" />
        </li>
      ))}
    </ul>
  );
}

function CategoryRow({ category, highlighted, onEdit, onDelete }) {
  const { name, productCount } = category;
  return (
    <li
      data-category-id={category.id}
      className={`flex flex-col gap-2 p-4 transition-colors duration-700 motion-reduce:transition-none md:hover:bg-surface-muted ${ROW_GRID} ${
        highlighted ? 'bg-accent-soft md:hover:bg-accent-soft' : ''
      }`}
    >
      <p title={name} className="line-clamp-2 break-words font-semibold">
        {name}
      </p>
      <p className="text-small text-ink-muted">{productCount} sản phẩm</p>
      <div className="grid grid-cols-2 gap-2 md:flex">
        <Button
          variant="secondary"
          onClick={onEdit}
          aria-label={`Sửa danh mục ${name}`}
          className="md:px-3"
        >
          <Pencil size={16} aria-hidden="true" />
          Sửa
        </Button>
        <Button
          variant="ghost"
          onClick={onDelete}
          aria-label={`Xóa danh mục ${name}`}
          className="!text-danger md:px-3"
        >
          <Trash2 size={16} aria-hidden="true" />
          Xóa
        </Button>
      </div>
    </li>
  );
}

/** Trang Danh mục `/admin/categories` (screens/categories.md, US-03). */
export function CategoriesPage() {
  usePageTitle('Danh mục');
  const toast = useAdminToast();
  const { status, categories, refreshFailed, reload, apply } = useCategories();
  const [dialog, setDialog] = useState(null); // { type: 'form' | 'delete', category? }
  const [highlightId, setHighlightId] = useState(null);
  const headingRef = useRef(null);

  // Tô dòng vừa thêm/đổi tên 2 giây và cuộn vào tầm nhìn.
  useEffect(() => {
    if (!highlightId) return undefined;
    document
      .querySelector(`[data-category-id="${highlightId}"]`)
      ?.scrollIntoView?.({ block: 'nearest' });
    const timer = setTimeout(() => setHighlightId(null), HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [highlightId]);

  const closeDialog = () => setDialog(null);
  const gone = (message) => {
    setDialog(null);
    toast.show(message, 'error');
    reload();
  };

  const saved = (category, mode) => {
    setDialog(null);
    apply((list) =>
      mode === 'create'
        ? [...list, category]
        : list.map((c) => (c.id === category.id ? category : c)),
    );
    setHighlightId(category.id);
    toast.show(mode === 'create' ? 'Đã thêm danh mục' : 'Đã đổi tên danh mục');
    reload();
  };

  const deleted = (category) => {
    setDialog(null);
    apply((list) => list.filter((c) => c.id !== category.id));
    toast.show('Đã xóa danh mục');
    headingRef.current?.focus();
    reload();
  };

  const openAdd = () => setDialog({ type: 'form' });
  const ready = status === 'ready';

  return (
    <section>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="font-display text-title font-semibold outline-none md:text-display"
          >
            Danh mục
          </h1>
          {ready && <p className="text-small text-ink-muted">Có {categories.length} danh mục</p>}
        </div>
        {status !== 'error' && (
          <Button onClick={openAdd} className="w-full sm:w-auto">
            <Plus size={18} aria-hidden="true" />
            Thêm danh mục
          </Button>
        )}
      </div>

      {refreshFailed && (
        <Alert variant="warning" className="mt-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>Chưa cập nhật được danh sách.</span>
            <button
              type="button"
              onClick={() => reload()}
              className="font-semibold text-accent-strong underline hover:text-ink"
            >
              Tải lại
            </button>
          </div>
        </Alert>
      )}

      <div className="mt-6">
        {status === 'loading' && (
          <>
            <span role="status" className="sr-only">
              Đang tải danh mục
            </span>
            <CategorySkeleton />
          </>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-line bg-surface px-4 py-12 text-center">
            <WifiOff size={40} aria-hidden="true" className="text-ink-subtle" />
            <p role="alert">Không thể tải danh mục. Vui lòng kiểm tra mạng và thử lại.</p>
            <Button variant="secondary" onClick={() => reload({ silent: false })}>
              Thử lại
            </Button>
          </div>
        )}

        {ready && categories.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-line bg-surface px-4 py-12 text-center">
            <Tags size={40} aria-hidden="true" className="text-ink-subtle" />
            <h2 className="font-display text-title font-semibold">Chưa có danh mục</h2>
            <p className="text-ink-muted">Tạo danh mục để bắt đầu thêm sản phẩm.</p>
            <Button onClick={openAdd}>Thêm danh mục</Button>
          </div>
        )}

        {ready && categories.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-line bg-surface">
            <div
              aria-hidden="true"
              className={`hidden border-b border-line px-4 py-2 text-caption font-semibold uppercase tracking-wider text-ink-muted ${ROW_GRID}`}
            >
              <span>Tên</span>
              <span>Sản phẩm</span>
              <span className="w-[180px]" />
            </div>
            <ul className="divide-y divide-line">
              {categories.map((category) => (
                <CategoryRow
                  key={category.id}
                  category={category}
                  highlighted={category.id === highlightId}
                  onEdit={() => setDialog({ type: 'form', category })}
                  onDelete={() => setDialog({ type: 'delete', category })}
                />
              ))}
            </ul>
          </div>
        )}
      </div>

      {dialog?.type === 'form' && (
        <CategoryFormModal
          key={dialog.category?.id ?? 'new'}
          category={dialog.category}
          otherNames={categories.filter((c) => c.id !== dialog.category?.id).map((c) => c.name)}
          onClose={closeDialog}
          onSaved={saved}
          onStale={() => reload()}
          onGone={gone}
        />
      )}
      {dialog?.type === 'delete' && (
        <DeleteCategoryModal
          key={dialog.category.id}
          category={dialog.category}
          onClose={closeDialog}
          onDeleted={deleted}
          onGone={gone}
          onBlocked={() => reload()}
        />
      )}
    </section>
  );
}
