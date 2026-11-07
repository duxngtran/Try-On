import { useId } from 'react';
import { AlertCircle } from 'lucide-react';

/**
 * Ô nhập nhiều dòng, cùng khung và trạng thái với `TextField` (design-system 7.13): label luôn hiện, hint, lỗi gắn
 * `aria-describedby`, tối thiểu 3 dòng, `resize-y`. Không có `maxlength` cứng: người dán chuỗi dài vẫn thấy lỗi
 * rõ ràng thay vì bị cắt im lặng.
 */
export function TextAreaField({
  label,
  error,
  hint,
  rows = 3,
  className = '',
  ref,
  ...textareaProps
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const ids = [error && errorId, hint && hintId].filter(Boolean).join(' ');
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-small font-semibold text-ink">
        {label}
      </label>
      <textarea
        id={id}
        ref={ref}
        rows={rows}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={ids || undefined}
        className={[
          'min-h-24 w-full resize-y rounded-md bg-surface px-4 py-3 text-body text-ink placeholder:text-ink-subtle',
          'read-only:bg-surface-muted',
          error
            ? 'border-2 border-danger'
            : 'border border-line-strong hover:border-ink-muted focus:border-ink',
        ].join(' ')}
        {...textareaProps}
      />
      {hint && (
        <p id={hintId} className="mt-1.5 text-small text-ink-muted">
          {hint}
        </p>
      )}
      <p
        id={errorId}
        aria-live="polite"
        className={error ? 'mt-1.5 flex gap-1.5 text-small text-danger' : 'hidden'}
      >
        {error && (
          <>
            <AlertCircle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </>
        )}
      </p>
    </div>
  );
}
