import { Loader2 } from 'lucide-react';

const VARIANTS = {
  primary: 'bg-ink text-ink-inverse hover:bg-[#333]',
  secondary: 'border border-line-strong bg-surface text-ink hover:bg-surface-muted',
  ghost: 'text-ink hover:underline',
  danger: 'bg-danger text-ink-inverse hover:bg-[#9c3a33]',
};
const SIZES = { md: 'h-11 px-5 text-small', lg: 'h-12 px-5 text-body' };

/**
 * Nút theo design system 7.1. Hai cách báo "đang gửi", cùng giữ nguyên chiều rộng và chặn gửi trùng:
 * - `loading`: đặt thuộc tính `disabled` (người dùng bàn phím mất focus). Dùng khi không cần giữ focus.
 * - `busy` (D-160, design-system 7.13): `aria-disabled` + `aria-busy`, KHÔNG `disabled`, giữ nguyên màu của
 *   biến thể (mờ nhẹ), nên nút vẫn focus được và không mất focus về `body` khi vừa bấm.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  busy = false,
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
  const working = loading || busy;
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-disabled={softDisabled || busy || undefined}
      onClick={softDisabled || busy ? undefined : onClick}
      aria-busy={working || undefined}
      className={[
        'inline-flex items-center justify-center gap-2 rounded-md font-semibold transition active:scale-[0.98]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
        SIZES[size],
        inactive
          ? 'cursor-not-allowed bg-disabled-bg text-disabled-ink active:scale-100'
          : VARIANTS[variant],
        busy && !inactive ? 'cursor-progress opacity-80 active:scale-100' : '',
        fullWidth ? 'w-full' : '',
        className,
      ].join(' ')}
      {...rest}
    >
      {working && (
        <Loader2 size={16} aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
      )}
      {working && loadingText ? loadingText : children}
    </button>
  );
}
