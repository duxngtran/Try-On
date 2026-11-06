import { Link } from 'react-router';

const VARIANTS = {
  primary: 'bg-ink text-ink-inverse hover:bg-[#333]',
  secondary: 'border border-line-strong bg-surface text-ink hover:bg-surface-muted',
};
const SIZES = { md: 'h-11 px-5 text-small', lg: 'h-12 px-5 text-body' };

/** Liên kết trông như `Button` (design-system 7.1): dùng khi hành động là điều hướng, không phải gửi request. */
export function LinkButton({
  to,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = '',
  children,
  ...rest
}) {
  return (
    <Link
      to={to}
      className={[
        'inline-flex items-center justify-center gap-2 rounded-md font-semibold transition active:scale-[0.98]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
        SIZES[size],
        VARIANTS[variant],
        fullWidth ? 'w-full' : '',
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </Link>
  );
}
