import { CATEGORY_MESSAGES } from './categorySchemas.js';

const OFFLINE = 'Mất kết nối, vui lòng thử lại.';
const GENERIC = 'Đã có lỗi xảy ra. Vui lòng thử lại sau.';
const RATE_LIMITED = 'Bạn thao tác quá nhanh, vui lòng thử lại sau.';
export const NOT_FOUND_MESSAGE = 'Không tìm thấy danh mục.';

export const hasProductsMessage = (count) =>
  `Danh mục đang có ${count} sản phẩm. Hãy chuyển hoặc xóa các sản phẩm này trước.`;

/**
 * Lỗi lưu (thêm/đổi tên) -> cách hiển thị (screens/categories.md mục 4).
 * @returns {{
 *   kind: 'field' | 'gone' | 'alert' | 'rate',
 *   message: string,
 *   refresh: boolean,
 *   retryAfterSeconds: number | null,
 * }}
 */
export function mapSaveError(error) {
  const base = { refresh: false, retryAfterSeconds: null };
  switch (error?.code) {
    case 'CATEGORY_NAME_EXISTS':
      return { ...base, kind: 'field', message: CATEGORY_MESSAGES.exists, refresh: true };
    case 'VALIDATION_ERROR': {
      const detail = Array.isArray(error.details)
        ? error.details.find((d) => d.field === 'name')
        : null;
      return detail
        ? { ...base, kind: 'field', message: detail.message }
        : { ...base, kind: 'alert', message: GENERIC };
    }
    case 'NOT_FOUND':
      return { ...base, kind: 'gone', message: NOT_FOUND_MESSAGE, refresh: true };
    case 'TOO_MANY_REQUESTS': {
      const seconds = Number(error.details?.retryAfterSeconds);
      return {
        ...base,
        kind: 'rate',
        message: RATE_LIMITED,
        retryAfterSeconds: Number.isFinite(seconds) && seconds > 0 ? seconds : null,
      };
    }
    case 'NETWORK_ERROR':
      return { ...base, kind: 'alert', message: OFFLINE };
    default:
      return { ...base, kind: 'alert', message: GENERIC };
  }
}

/**
 * Lỗi xóa -> `blocked` (409, kèm số sản phẩm theo server), `gone` (404) hoặc `alert`.
 * @returns {{ kind: 'blocked', productCount: number | null } | { kind: 'gone' | 'alert', message: string }}
 */
export function mapDeleteError(error) {
  if (error?.code === 'CATEGORY_HAS_PRODUCTS') {
    const count = Number(error.details?.productCount);
    return { kind: 'blocked', productCount: Number.isInteger(count) && count > 0 ? count : null };
  }
  if (error?.code === 'NOT_FOUND') return { kind: 'gone', message: NOT_FOUND_MESSAGE };
  return { kind: 'alert', message: error?.code === 'NETWORK_ERROR' ? OFFLINE : GENERIC };
}
