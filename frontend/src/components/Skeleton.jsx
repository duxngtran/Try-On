/** Khối chờ shimmer (tắt khi giảm chuyển động, vẫn hiện khối tĩnh). Trang tự khai báo `aria-busy` và vùng `role="status"`. */
export function Skeleton({ className = '' }) {
  return (
    <div
      aria-hidden="true"
      className={`rounded-md bg-[linear-gradient(90deg,var(--color-surface-muted),var(--color-line),var(--color-surface-muted))] bg-[length:200%_100%] animate-shimmer motion-reduce:animate-none ${className}`}
    />
  );
}
