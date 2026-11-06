import { useEffect, useId, useRef } from 'react';
import { Check } from 'lucide-react';

const CHIP =
  'inline-flex min-h-11 max-w-full shrink-0 snap-start items-center gap-1.5 rounded-full border px-4 text-small font-semibold transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink';

/**
 * Chọn danh mục (design-system 7.12). Không tự chọn danh mục nào (D-72). Mobile: một hàng cuộn ngang có dải
 * mờ ở mép phải; từ md: xuống dòng. Không dùng roving tabindex: phím ← → để dành cho chuyển sản phẩm (US-06).
 * `chipsRef.current` cho phép nơi khác (nút "Danh mục khác") đưa focus về chip đang chọn.
 */
export function CategoryChips({ categories, selectedId, onSelect, busy = false, chipsRef }) {
  const labelId = useId();
  const selectedRef = useRef(null);

  useEffect(() => {
    // Chip đang chọn cuộn vào giữa hàng (không làm trang cuộn dọc).
    selectedRef.current?.scrollIntoView?.({ inline: 'center', block: 'nearest' });
  }, [selectedId]);

  return (
    <div className="relative" ref={chipsRef}>
      <p id={labelId} className="sr-only text-small font-semibold md:not-sr-only md:mb-2">
        Danh mục
      </p>
      <div
        role="group"
        aria-labelledby={labelId}
        aria-busy={busy || undefined}
        className="flex snap-x gap-2 overflow-x-auto pb-1 pr-8 [scrollbar-width:none] md:flex-wrap md:overflow-visible md:pr-0 [&::-webkit-scrollbar]:hidden"
      >
        {categories.map((category) => {
          const selected = category.id === selectedId;
          return (
            <button
              key={category.id}
              ref={selected ? selectedRef : undefined}
              type="button"
              aria-pressed={selected}
              aria-label={`${category.name}, ${category.productCount} sản phẩm`}
              title={category.name}
              onClick={() => onSelect(category)}
              className={`${CHIP} ${
                selected
                  ? 'border-ink bg-ink text-ink-inverse'
                  : 'border-line-strong bg-surface text-ink hover:bg-surface-muted'
              }`}
            >
              {selected && <Check size={16} aria-hidden="true" className="shrink-0" />}
              <span className="truncate">{category.name}</span>
            </button>
          );
        })}
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-canvas to-transparent md:hidden"
      />
    </div>
  );
}
