import { useRef } from 'react';
import { Button } from '../../components/Button.jsx';
import { Modal } from '../../components/Modal.jsx';

/** Hộp thoại "Rời khỏi trang?" (screens/product-form.md mục 9). Focus mặc định ở **Ở lại**. */
export function LeaveDialog({ blocker, saving }) {
  const stayRef = useRef(null);
  if (blocker.state !== 'blocked') return null;
  return (
    <Modal
      open
      title="Rời khỏi trang?"
      onClose={() => blocker.reset()}
      initialFocusRef={stayRef}
      actions={
        <>
          <Button variant="secondary" onClick={() => blocker.proceed()}>
            Rời đi
          </Button>
          <Button ref={stayRef} onClick={() => blocker.reset()}>
            Ở lại
          </Button>
        </>
      }
    >
      <p>
        {saving
          ? 'Sản phẩm đang được lưu. Rời đi bây giờ có thể không biết kết quả.'
          : 'Thông tin chưa lưu sẽ mất.'}
      </p>
    </Modal>
  );
}
