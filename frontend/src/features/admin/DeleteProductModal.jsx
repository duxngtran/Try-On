import { useRef, useState } from 'react';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { Modal } from '../../components/Modal.jsx';
import { mapProductDeleteError } from './productErrors.js';
import { productsApi } from './productsApi.js';

/** Xác nhận xóa sản phẩm (screens/products.md mục 4). Xóa mềm, không hoàn tác (D-42). */
export function DeleteProductModal({ product, onClose, onDeleted, onGone }) {
  const cancelRef = useRef(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null); // { variant, message }

  const confirm = async () => {
    setDeleting(true);
    setError(null);
    try {
      await productsApi.remove(product.id);
      onDeleted(product);
    } catch (err) {
      const mapped = mapProductDeleteError(err);
      if (mapped.kind === 'gone') {
        onGone(mapped.message);
        return;
      }
      setError({ variant: mapped.kind === 'rate' ? 'warning' : 'danger', message: mapped.message });
      setDeleting(false);
    }
  };

  return (
    <Modal
      open
      title="Xóa sản phẩm?"
      onClose={onClose}
      busy={deleting}
      initialFocusRef={cancelRef}
      actions={
        <>
          <Button ref={cancelRef} variant="secondary" onClick={onClose} disabled={deleting}>
            Hủy
          </Button>
          <Button
            className="!bg-danger !text-ink-inverse"
            loading={deleting}
            loadingText="Đang xóa…"
            onClick={confirm}
          >
            Xóa sản phẩm
          </Button>
        </>
      }
    >
      <p>
        Xóa sản phẩm <strong className="break-words font-semibold text-ink">{product.name}</strong>?
        Khách sẽ không còn thấy sản phẩm này. Không thể hoàn tác.
      </p>
      {error && (
        <Alert variant={error.variant} role="alert" className="mt-4">
          {error.message}
        </Alert>
      )}
    </Modal>
  );
}
