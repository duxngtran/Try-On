import { AlertCircle, CheckCircle2, Clock, Info, X } from 'lucide-react';

const VARIANTS = {
  danger: { box: 'border-danger bg-danger-soft', icon: AlertCircle, color: 'text-danger' },
  success: { box: 'border-success bg-success-soft', icon: CheckCircle2, color: 'text-success' },
  warning: { box: 'border-warning bg-warning-soft', icon: Clock, color: 'text-warning' },
  info: { box: 'border-accent bg-accent-soft', icon: Info, color: 'text-accent-strong' },
};

/** Alert nội tuyến (design-system 7.4). `role` do nơi dùng quyết định (alert cho lỗi, status cho thông tin). */
export function Alert({
  variant = 'info',
  role = 'status',
  onClose,
  children,
  className = '',
  ref,
  ...rest
}) {
  const { box, icon: Icon, color } = VARIANTS[variant];
  return (
    <div
      ref={ref}
      role={role}
      className={`flex items-start gap-3 rounded-md border-l-4 p-3 text-small outline-none ${box} ${className}`}
      {...rest}
    >
      <Icon size={20} aria-hidden="true" className={`mt-0.5 shrink-0 ${color}`} />
      <div className="min-w-0 flex-1 text-ink">{children}</div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng thông báo"
          className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-ink-muted hover:text-ink"
        >
          <X size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
