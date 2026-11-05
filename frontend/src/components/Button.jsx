import { Loader2 } from 'lucide-react';

const VARIANTS = {
  primary: 'bg-ink text-ink-inverse hover:bg-[#333]',
  secondary: 'border border-line-strong bg-surface text-ink hover:bg-surface-muted',
  ghost: 'text-ink hover:underline',
};
const SIZES = { md: 'h-11 px-5 text-small', lg: 'h-12 px-5 text-body' };

/**
 * Nút theo design system 7.1. `loading` giữ nguyên chiều rộng, vẫn disabled để chặn gửi trùng.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  loadingText,
  fullWidth = false,
  disabled = false,
  softDisabled = false,
  onClick,
  className = '',
  children,
  type = 'button',
  ...rest
}) {
  // softDisabled: trông như bị khóa và chặn click nhưng vẫn focus được để đọc lý do (aria-describedby).
  const inactive = disabled || loading || softDisabled;
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-disabled={softDisabled || undefined}
      onClick={softDisabled ? undefined : onClick}
      aria-busy={loading || undefined}
      className={[
        'inline-flex items-center justify-center gap-2 rounded-md font-semibold transition active:scale-[0.98]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
        SIZES[size],
        inactive
          ? 'cursor-not-allowed bg-disabled-bg text-disabled-ink active:scale-100'
          : VARIANTS[variant],
        fullWidth ? 'w-full' : '',
        className,
      ].join(' ')}
      {...rest}
    >
      {loading && <Loader2 size={16} aria-hidden="true" className="animate-spin" />}
      {loading && loadingText ? loadingText : children}
    </button>
  );
}
