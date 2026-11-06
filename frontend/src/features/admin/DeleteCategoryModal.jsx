import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { Info } from 'lucide-react';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { Modal } from '../../components/Modal.jsx';
import { categoriesApi } from './categoriesApi.js';
import { hasProductsMessage, mapDeleteError } from './categoryErrors.js';

/**
 * Xóa danh mục (screens/categories.md mục 5). Hai chế độ:
 * - xác nhận (0 sản phẩm theo danh sách) -> gọi API xóa;
 * - chặn (>= 1 sản phẩm, hoặc server trả 409) -> chỉ giải thích, không có nút Xóa, không gọi API.
 * Số trong chế độ chặn lấy từ server khi có.
 */
export function DeleteCategoryModal({ category, onClose, onDeleted, onGone, onBlocked }) {
  const safeRef = useRef(null);
  const [serverCount, setServerCount] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  const blockedCount = serverCount ?? (category.productCount > 0 ? category.productCount : null);

  const confirm = async () => {
    setDeleting(true);
    setError(null);
    try {
      await categoriesApi.remove(category.id);
      onDeleted(category);
    } catch (err) {
      const mapped = mapDeleteError(err);
      if (mapped.kind === 'blocked') {
        // Giữ hộp thoại, đổi nội dung; danh sách tải lại ngầm để số liệu đúng.
        setServerCount(mapped.productCount ?? 1);
        onBlocked();
      } else if (mapped.kind === 'gone') {
        onGone(mapped.message);
        return;
      } else {
        setError(mapped.message);
      }
      setDeleting(false);
    }
  };

  if (blockedCount !== null) {
    return (
      <Modal
        open
        title="Chưa thể xóa danh mục"
        onClose={onClose}
        initialFocusRef={safeRef}
        actions={
          <>
            <Button ref={safeRef} variant="secondary" onClick={onClose}>
              Đóng
            </Button>
            <Link
              to={`/admin/products?categoryId=${category.id}`}
              className="inline-flex h-11 items-center justify-center rounded-md bg-ink px-5 text-small font-semibold text-ink-inverse hover:bg-[#333] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              Xem sản phẩm
            </Link>
          </>
        }
      >
        <div className="flex gap-3">
          <Info size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-accent-strong" />
          <p>{hasProductsMessage(blockedCount)}</p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open
      title="Xóa danh mục?"
      onClose={onClose}
      busy={deleting}
      initialFocusRef={safeRef}
      actions={
        <>
          <Button ref={safeRef} variant="secondary" onClick={onClose} disabled={deleting}>
            Hủy
          </Button>
          <Button variant="danger" loading={deleting} loadingText="Đang xóa…" onClick={confirm}>
            Xóa danh mục
          </Button>
        </>
      }
    >
      <p>
        Xóa danh mục <strong className="font-semibold text-ink">{category.name}</strong>? Không thể
        hoàn tác.
      </p>
      {error && (
        <Alert variant="danger" role="alert" className="mt-4">
          {error}
        </Alert>
      )}
    </Modal>
  );
}
