import { useId, useState } from 'react';
import { AlertCircle, Check, ImageOff, ImagePlus, X } from 'lucide-react';
import { Button } from '../../components/Button.jsx';
import { PRODUCT_IMAGE_ACCEPT, formatFileSize } from './productImageRules.js';

const GUIDE = [
  { ok: true, text: 'Một sản phẩm, trải phẳng.' },
  { ok: false, text: 'Không có người mặc hoặc ma-nơ-canh.' },
  { ok: true, text: 'Thấy trọn sản phẩm, không bị cắt hay che.' },
  { ok: true, text: 'Nền trơn, sáng màu, đủ sáng, màu đúng thật.' },
  { ok: false, text: 'Không chữ, logo cửa hàng hay watermark chèn trên ảnh.' },
];

/** Checklist chụp ảnh flat lay (design-system 7.10). Chỉ để nhắc, không chặn lưu (cùng tinh thần D-35). */
export function FlatLayGuide({ defaultOpen }) {
  return (
    <details open={defaultOpen} className="rounded-lg border border-line bg-surface-muted p-4">
      <summary className="cursor-pointer text-small font-semibold text-ink">
        Ảnh flat lay: cách chụp
      </summary>
      <ul className="mt-3 space-y-2 text-small text-ink">
        {GUIDE.map(({ ok, text }) => (
          <li key={text} className="flex gap-2">
            {ok ? (
              <Check size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-success" />
            ) : (
              <X size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-danger" />
            )}
            {text}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-caption text-ink-muted">
        Ảnh được chuyển sang JPEG, tối đa 2048 px, nền trắng nếu có nền trong suốt.
      </p>
    </details>
  );
}

/**
 * Khung chọn ảnh sản phẩm 1:1 (screens/product-form.md mục 4).
 * - `preview`: ảnh mới đã qua kiểm tra sơ bộ `{ file, url, width, height }` hoặc null;
 * - `current`: ảnh hiện tại khi sửa `{ url, name }` hoặc null;
 * - `onPick(file)`; `onKeep()` bỏ ảnh mới (chỉ khi sửa); `buttonRef` để focus khi lỗi.
 */
export function ProductImageField({
  preview,
  current,
  error,
  disabled,
  saving,
  onPick,
  onKeep,
  buttonRef,
}) {
  const inputId = useId();
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const [dragging, setDragging] = useState(false);
  const [currentFailed, setCurrentFailed] = useState(false);

  const openPicker = () => {
    if (!disabled) document.getElementById(inputId)?.click();
  };
  const onChange = (event) => {
    const [file] = event.target.files;
    event.target.value = ''; // cho phép chọn lại đúng file đó
    if (file) onPick(file);
  };
  const onDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    const [file] = event.dataTransfer.files;
    if (file && !disabled) onPick(file);
  };

  const shown = preview ? { url: preview.url, alt: 'Xem trước ảnh sản phẩm' } : current;
  const showCurrentFailed = !preview && currentFailed;

  const border = error
    ? 'border-2 border-danger'
    : dragging
      ? 'border-2 border-ink bg-accent-soft'
      : 'border-2 border-dashed border-line-strong hover:border-ink-muted';
  const label = preview ? 'Chọn ảnh khác' : current ? 'Thay ảnh' : 'Chọn ảnh sản phẩm';

  return (
    <div className="w-full max-w-xs">
      <input
        id={inputId}
        type="file"
        accept={PRODUCT_IMAGE_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        onChange={onChange}
        disabled={disabled}
      />
      <button
        type="button"
        ref={buttonRef}
        onClick={openPicker}
        disabled={disabled}
        aria-label={shown ? 'Khung ảnh sản phẩm, bấm để đổi ảnh' : 'Chọn ảnh sản phẩm'}
        aria-describedby={[hintId, error && errorId].filter(Boolean).join(' ')}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg bg-surface-muted ${border} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed`}
      >
        {showCurrentFailed ? (
          <span className="flex flex-col items-center gap-2 px-4 text-center text-small text-ink-muted">
            <ImageOff size={24} aria-hidden="true" />
            Không tải được ảnh hiện tại
          </span>
        ) : shown ? (
          <img
            key={shown.url}
            src={shown.url}
            alt={shown.alt ?? current?.name ?? ''}
            onError={() => !preview && setCurrentFailed(true)}
            className={`h-full w-full animate-toast-in object-contain motion-reduce:animate-none ${saving ? 'opacity-60' : ''}`}
          />
        ) : (
          <span className="flex flex-col items-center gap-2 px-4 text-center">
            <ImagePlus size={32} aria-hidden="true" className="text-ink-muted" />
            <span className="font-semibold text-ink">Chọn ảnh sản phẩm</span>
            <span className="text-small text-ink-muted">JPG, PNG, WEBP · tối đa 10 MB</span>
          </span>
        )}
        {preview && current && (
          <span className="absolute left-2 top-2 rounded-sm bg-accent-soft px-2 py-0.5 text-caption font-semibold uppercase tracking-wider text-accent-strong">
            Ảnh mới
          </span>
        )}
      </button>

      <div id={hintId} className="mt-2 text-small text-ink-muted">
        {preview ? (
          <>
            <p className="truncate" title={preview.file.name}>
              {preview.file.name}
            </p>
            <p>
              {preview.width} × {preview.height} px · {formatFileSize(preview.file.size)}
            </p>
          </>
        ) : (
          <p>JPG, PNG hoặc WEBP, tối đa 10 MB. Cạnh ngắn từ 512 px.</p>
        )}
      </div>

      {error && (
        <p id={errorId} role="alert" className="mt-1.5 flex gap-1.5 text-small text-danger">
          <AlertCircle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}

      <div className="mt-3 flex flex-col gap-2">
        {shown && (
          <Button variant="secondary" onClick={openPicker} disabled={disabled} fullWidth>
            {label}
          </Button>
        )}
        {preview && current && (
          <Button variant="ghost" onClick={onKeep} disabled={disabled}>
            Giữ ảnh cũ
          </Button>
        )}
      </div>
    </div>
  );
}
