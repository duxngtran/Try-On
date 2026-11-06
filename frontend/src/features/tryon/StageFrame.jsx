import { Sparkles } from 'lucide-react';

export const AI_LABEL = 'Ảnh do AI tạo, chỉ để tham khảo, không thể hiện độ vừa vặn';

/**
 * Khung ảnh 3:4 cố định (design-system 7.12). Kích thước không đổi giữa ảnh trải phẳng, ảnh thử đồ,
 * skeleton và lỗi. `showAiLabel`: nhãn AI luôn là văn bản thật dưới ảnh thử đồ (D-83); chỗ của nó được
 * giữ sẵn để hiện/ẩn nhãn không đẩy khối thông tin xuống.
 */
export function StageFrame({ children, showAiLabel = false, labelledBy, busy = false }) {
  return (
    <figure
      aria-labelledby={labelledBy}
      aria-busy={busy || undefined}
      className="mx-auto w-[min(100%,calc(60dvh*0.75),420px)] lg:w-[min(100%,480px,calc(min(70dvh,640px)*0.75))] [@media(max-height:500px)]:w-[min(100%,calc(75dvh*0.75))]"
    >
      <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-surface-muted">
        {children}
      </div>
      <figcaption className="flex min-h-10 items-start gap-1.5 pt-2 text-small text-ink-muted">
        {showAiLabel && (
          <>
            <Sparkles size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
            <span>{AI_LABEL}</span>
          </>
        )}
      </figcaption>
    </figure>
  );
}

/** Nền shimmer cho skeleton (tắt khi giảm chuyển động). */
export const SHIMMER =
  'bg-[linear-gradient(90deg,var(--color-surface-muted),var(--color-line),var(--color-surface-muted))] bg-[length:200%_100%] animate-shimmer motion-reduce:animate-none';
