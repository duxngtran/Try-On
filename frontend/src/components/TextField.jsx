import { useId, useState } from 'react';
import { AlertCircle, Eye, EyeOff } from 'lucide-react';

/**
 * Ô nhập có label, hint và lỗi gắn aria-describedby (design-system 7.2).
 * `type="password"` tự có nút hiện/ẩn. `describedBy` thêm id của vùng mô tả khác (vd. checklist).
 * `suffix` là đơn vị hiển thị bên phải ô (vd. "cm"), chỉ trang trí vì label/hint đã nêu đơn vị.
 */
export function TextField({
  label,
  error,
  hint,
  describedBy,
  suffix,
  type = 'text',
  className = '',
  ref,
  ...inputProps
}) {
  const id = useId();
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === 'password';
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const ids = [error && errorId, hint && hintId, describedBy].filter(Boolean).join(' ');

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-small font-semibold text-ink">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          ref={ref}
          type={isPassword && revealed ? 'text' : type}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={ids || undefined}
          className={[
            'h-12 w-full rounded-md bg-surface px-4 text-body text-ink placeholder:text-ink-subtle lg:h-11',
            'read-only:bg-surface-muted',
            error
              ? 'border-2 border-danger'
              : 'border border-line-strong hover:border-ink-muted focus:border-ink',
            isPassword || suffix ? 'pr-12' : '',
          ].join(' ')}
          {...inputProps}
        />
        {suffix && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-body text-ink-muted"
          >
            {suffix}
          </span>
        )}
        {isPassword && (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            aria-label={revealed ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
            aria-pressed={revealed}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-ink-muted hover:text-ink"
          >
            {revealed ? (
              <EyeOff size={20} aria-hidden="true" />
            ) : (
              <Eye size={20} aria-hidden="true" />
            )}
          </button>
        )}
      </div>
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
