import { DEFAULT_RETRY_SECONDS } from '../tryon/tryonConfig.js';
import { formatPriceVnd } from '../tryon/tryonFormat.js';

/** Chữ hiển thị lấy theo `error.code` và `details`, không dùng `error.message` của server (D-119). */
export const ADD_FAILED = 'Chưa thêm được vào giỏ. Vui lòng thử lại.';

const retrySeconds = (details) => {
  const seconds = Number(details?.retryAfterSeconds);
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : DEFAULT_RETRY_SECONDS;
};

/**
 * Lỗi của nút Thêm vào giỏ, hiện ngay dưới nút (add-to-cart.md mục 2).
 * Số trong chữ lấy từ `details`; thiếu thì dùng câu không nêu số (phòng thủ).
 * @returns {{ variant: 'warning' | 'danger', text: string, retrySeconds?: number }}
 */
export function describeInlineError({ code, details }) {
  switch (code) {
    case 'NOT_FOUND':
      return { variant: 'warning', text: 'Sản phẩm này không còn bán.' };
    case 'CART_QUANTITY_LIMIT':
      return {
        variant: 'warning',
        text: Number.isFinite(details?.maxQuantity)
          ? `Mỗi sản phẩm chỉ đặt tối đa ${details.maxQuantity} món.`
          : 'Mỗi sản phẩm có giới hạn số lượng trong giỏ.',
      };
    case 'CART_FULL':
      return {
        variant: 'warning',
        text: `Giỏ hàng đã đầy${
          Number.isFinite(details?.maxLines) ? ` (tối đa ${details.maxLines} sản phẩm)` : ''
        }. Hãy bỏ bớt sản phẩm trong giỏ để thêm sản phẩm mới.`,
      };
    case 'TOO_MANY_REQUESTS': {
      const seconds = retrySeconds(details);
      return {
        variant: 'warning',
        text: `Bạn thao tác quá nhanh, thử lại sau ${seconds} giây.`,
        retrySeconds: seconds,
      };
    }
    default:
      // INTERNAL_ERROR, mất mạng, VALIDATION_ERROR (lỗi lập trình, không có chữ riêng cho người dùng).
      return { variant: 'danger', text: ADD_FAILED };
  }
}

/** Lỗi về muộn khi người mua đã sang sản phẩm khác: toast nêu tên sản phẩm đã bấm (add-to-cart.md mục 2). */
export function describeLateError({ code, details }, name) {
  switch (code) {
    case 'NOT_FOUND':
      return `${name} không còn bán.`;
    case 'CART_QUANTITY_LIMIT':
      return Number.isFinite(details?.maxQuantity)
        ? `${name}: mỗi sản phẩm chỉ đặt tối đa ${details.maxQuantity} món.`
        : `${name}: mỗi sản phẩm có giới hạn số lượng trong giỏ.`;
    case 'CART_FULL':
      return `Chưa thêm được ${name}. ${describeInlineError({ code, details }).text}`;
    case 'TOO_MANY_REQUESTS':
      return `Chưa thêm được ${name}. Bạn thao tác quá nhanh, thử lại sau ${retrySeconds(details)} giây.`;
    default:
      return `Chưa thêm được ${name} vào giỏ. Vui lòng thử lại.`;
  }
}

/** Lời xác nhận. `priceAtClick` là giá đang hiện lúc bấm; khác giá trong giỏ thì báo giá hiện tại (E6, AC-11). */
export function describeAdded({ name, priceAtClick, priceNow }) {
  const base = `Đã thêm ${name} vào giỏ.`;
  return Number.isFinite(priceNow) && priceNow !== priceAtClick
    ? `${base} Giá hiện tại: ${formatPriceVnd(priceNow)}.`
    : base;
}
