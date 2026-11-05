import { Loader2 } from 'lucide-react';

/** Vòng quay; chữ ẩn cho trình đọc màn hình (design-system 7.8). */
export function Spinner({ size = 16, label = 'Đang tải' }) {
  return (
    <>
      <Loader2 size={size} aria-hidden="true" className="animate-spin text-accent" />
      {label && <span className="sr-only">{label}</span>}
    </>
  );
}
