import { useEffect, useId, useRef, useState } from 'react';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { Modal } from '../../components/Modal.jsx';
import { TextField } from '../../components/TextField.jsx';
import { formatMmSs, useCountdown } from '../../hooks/useCountdown.js';
import { categoriesApi } from './categoriesApi.js';
import { mapSaveError } from './categoryErrors.js';
import { validateCategoryName } from './categorySchemas.js';

/**
 * Hộp thoại thêm / đổi tên danh mục (screens/categories.md mục 4). `category` có mặt = chế độ sửa.
 * `otherNames`: tên các danh mục khác đang hiển thị, để báo trùng sớm.
 * `onSaved(category, mode)`, `onStale()` (tải lại danh sách ngầm), `onGone(message)` do trang quyết định cách cập nhật danh sách.
 */
export function CategoryFormModal({ category, otherNames, onClose, onSaved, onStale, onGone }) {
  const editing = Boolean(category);
  const formId = useId();
  const inputRef = useRef(null);
  const [value, setValue] = useState(category?.name ?? '');
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState(null); // lỗi gắn với ô tên, từ server
  const [alert, setAlert] = useState(null); // { variant, message }
  const [saving, setSaving] = useState(false);
  const countdown = useCountdown();

  // Chế độ sửa chọn sẵn toàn bộ tên để gõ đè nhanh.
  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const check = validateCategoryName(value, { names: otherNames });
  const fieldError = serverError ?? (touched && check.error ? check.error : null);
  const waiting = countdown.state === 'running';

  const submit = async (event) => {
    event.preventDefault();
    if (saving || waiting) return;
    setTouched(true);
    setAlert(null);
    setServerError(null);
    if (check.error) {
      inputRef.current?.focus();
      return;
    }
    if (editing && check.name === category.name) {
      onClose();
      return;
    }

    setSaving(true);
    try {
      const saved = editing
        ? await categoriesApi.rename(category.id, check.name)
        : await categoriesApi.create(check.name);
      onSaved(saved, editing ? 'rename' : 'create');
    } catch (error) {
      const mapped = mapSaveError(error);
      if (mapped.kind === 'gone') {
        onGone(mapped.message);
        return;
      }
      if (mapped.kind === 'field') setServerError(mapped.message);
      else
        setAlert({
          variant: mapped.kind === 'rate' ? 'warning' : 'danger',
          message: mapped.message,
        });
      if (mapped.kind === 'rate' && mapped.retryAfterSeconds)
        countdown.start(mapped.retryAfterSeconds);
      if (mapped.refresh) onStale();
      setSaving(false);
      if (mapped.kind === 'field') inputRef.current?.focus();
    }
  };

  return (
    <Modal
      open
      title={editing ? 'Đổi tên danh mục' : 'Thêm danh mục'}
      onClose={onClose}
      busy={saving}
      initialFocusRef={inputRef}
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Hủy
          </Button>
          <Button
            type="submit"
            form={formId}
            loading={saving}
            loadingText="Đang lưu…"
            softDisabled={waiting}
          >
            Lưu
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate>
        <TextField
          ref={inputRef}
          label="Tên danh mục"
          hint="2 đến 50 ký tự."
          autoComplete="off"
          value={value}
          readOnly={saving}
          error={fieldError}
          onChange={(event) => {
            setValue(event.target.value);
            setServerError(null);
          }}
          onBlur={() => setTouched(true)}
        />
        {alert && (
          <Alert
            variant={alert.variant}
            role={alert.variant === 'danger' ? 'alert' : 'status'}
            className="mt-4"
          >
            {alert.message}
            {waiting && ` Thử lại sau ${formatMmSs(countdown.remainingSeconds)}.`}
          </Alert>
        )}
      </form>
    </Modal>
  );
}
