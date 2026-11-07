import { AlertCircle, Info, PackageX, Trash2 } from 'lucide-react';
import { Button } from '../../components/Button.jsx';
import { ProductThumb } from '../admin/ProductThumb.jsx';
import { formatPriceVnd, spokenVnd } from './cartFormat.js';
import { QuantityStepper } from './QuantityStepper.jsx';

const BADGE =
  'inline-flex items-center gap-1 rounded-sm bg-warning-soft px-2 py-0.5 text-small font-semibold text-warning';
const THUMB = 'h-[72px] w-[72px] md:h-24 md:w-24';

/**
 * Một dòng giỏ (screens/cart.md mục 1). Chỉ hiển thị số tiền do backend trả (`priceVnd`, `lineTotalVnd`):
 * không tự tính, kể cả lúc chờ response (US-08 R1).
 * @param {{
 *   item: import('./cartContext.js').CartItem, maxQuantity: number, busy: boolean, locked: boolean,
 *   error?: string, onSet: (quantity: number) => void, onRemove: () => void,
 * }} props
 */
export function CartLine({ item, maxQuantity, busy, locked, error, onSet, onRemove }) {
  const removeLabel = `Bỏ ${item.name} khỏi giỏ`;
  const removeBlocked = busy || locked;

  if (!item.available) {
    const removeButton = (extra) => (
      <Button
        variant="secondary"
        busy={busy}
        softDisabled={locked && !busy}
        onClick={onRemove}
        aria-label={removeLabel}
        data-remove={item.productId}
        {...extra}
      >
        Bỏ khỏi giỏ
      </Button>
    );
    return (
      <li
        aria-busy={busy || undefined}
        data-cart-line={item.productId}
        className="border-l-4 border-warning p-4"
      >
        <div className="flex gap-3 md:gap-4">
          <div className="opacity-60">
            <ProductThumb url={item.image.url} name={item.name} sizeClass={THUMB} pixels={96} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-body font-semibold" title={item.name}>
              {item.name}
            </p>
            <p className="text-small text-ink-muted">{item.category.name}</p>
            <p className={`${BADGE} mt-1`}>
              <PackageX size={16} aria-hidden="true" />
              Không còn bán
            </p>
            <p className="mt-1 text-small text-ink-muted">Không tính vào tổng tiền.</p>
            <p className="text-small text-ink-muted">Số lượng: {item.quantity}</p>
          </div>
          <div className="hidden self-center md:block">{removeButton()}</div>
        </div>
        <div className="mt-3 md:hidden">{removeButton({ fullWidth: true })}</div>
      </li>
    );
  }

  return (
    <li
      aria-busy={busy || undefined}
      data-cart-line={item.productId}
      className="p-4 lg:hover:bg-surface-muted"
    >
      <div className="grid grid-cols-[72px_1fr_44px] gap-x-3 gap-y-3 md:grid-cols-[96px_1fr_auto_120px_auto] md:items-center md:gap-x-4">
        <div className="md:col-start-1 md:row-start-1">
          <ProductThumb url={item.image.url} name={item.name} sizeClass={THUMB} pixels={96} />
        </div>
        <div className="min-w-0 md:col-start-2 md:row-start-1">
          <p className="line-clamp-2 text-body font-semibold" title={item.name}>
            {item.name}
          </p>
          <p className="text-small text-ink-muted">{item.category.name}</p>
          <p className="text-small tabular-nums">
            {formatPriceVnd(item.priceVnd)}
            <span className="sr-only"> mỗi món, {spokenVnd(item.priceVnd)}</span>
          </p>
          {item.priceChangedFrom !== null && (
            <p className={`${BADGE} mt-1`}>
              <Info size={16} aria-hidden="true" />
              <span>
                Giá đã đổi từ {formatPriceVnd(item.priceChangedFrom)}
                <span className="sr-only">, hiện là {spokenVnd(item.priceVnd)}</span>
              </span>
            </p>
          )}
        </div>
        <div className="justify-self-end md:col-start-5 md:row-start-1">
          <button
            type="button"
            aria-label={removeLabel}
            aria-disabled={removeBlocked || undefined}
            onClick={removeBlocked ? undefined : onRemove}
            data-remove={item.productId}
            className={`flex h-11 w-11 items-center justify-center gap-1.5 rounded-md text-small font-semibold md:w-auto md:px-3 ${
              removeBlocked ? 'cursor-not-allowed text-disabled-ink' : 'text-danger hover:underline'
            }`}
          >
            <Trash2 size={20} aria-hidden="true" />
            <span aria-hidden="true" className="hidden md:inline">
              Bỏ
            </span>
          </button>
        </div>
        <div className="col-span-3 flex items-center justify-between gap-3 md:contents">
          <div className="md:col-start-3 md:row-start-1">
            <QuantityStepper
              name={item.name}
              quantity={item.quantity}
              maxQuantity={maxQuantity}
              busy={busy}
              locked={locked}
              onSet={onSet}
            />
          </div>
          <p
            className={`text-right text-body font-semibold tabular-nums md:col-start-4 md:row-start-1 ${
              busy ? 'opacity-60' : ''
            }`}
          >
            {formatPriceVnd(item.lineTotalVnd)}
            <span className="sr-only">, thành tiền {spokenVnd(item.lineTotalVnd)}</span>
          </p>
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-2 flex gap-1.5 text-small text-danger">
          <AlertCircle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </li>
  );
}
