import { useState } from 'react';
import { ImageOff } from 'lucide-react';

/**
 * Ảnh sản phẩm trong khung vuông `object-contain` trên nền `surface-muted` (design-system 7.11).
 * Khung giữ kích thước nên không nhảy layout; ảnh lỗi thì hiện icon, `alt` vẫn là tên sản phẩm.
 */
export function ProductThumb({ url, name, sizeClass = 'h-14 w-14 md:h-16 md:w-16', pixels = 64 }) {
  const [failedUrl, setFailedUrl] = useState(null);
  const failed = failedUrl === url;
  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-md bg-surface-muted ${sizeClass}`}
      role={failed ? 'img' : undefined}
      aria-label={failed ? name : undefined}
    >
      {failed ? (
        <span className="flex h-full w-full items-center justify-center text-ink-subtle">
          <ImageOff size={24} aria-hidden="true" />
        </span>
      ) : (
        <img
          src={url}
          alt={name}
          width={pixels}
          height={pixels}
          loading="lazy"
          onError={() => setFailedUrl(url)}
          className="h-full w-full object-contain"
        />
      )}
    </div>
  );
}
