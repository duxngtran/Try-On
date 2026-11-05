import { useId } from 'react';
import { AlertCircle, ChevronDown } from 'lucide-react';

/**
 * `<select>` gốc có label, hint và lỗi (design-system 7.11), để mobile dùng picker native.
 * `children` là các `<option>`.
 */
export function Select({ label, error, hint, className = '', ref, children, ...selectProps }) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error && errorId, hint && hintId].filter(Boolean).join(' ');

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-small font-semibold text-ink">
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          ref={ref}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedBy || undefined}
          className={[
            'h-12 w-full appearance-none rounded-md bg-surface pl-4 pr-11 text-body text-ink lg:h-11',
            'disabled:cursor-not-allowed disabled:bg-disabled-bg disabled:text-disabled-ink',
            error
              ? 'border-2 border-danger'
              : 'border border-line-strong hover:border-ink-muted focus:border-ink',
          ].join(' ')}
          {...selectProps}
        >
          {children}
        </select>
        <ChevronDown
          size={20}
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted"
        />
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
