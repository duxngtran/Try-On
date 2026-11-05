import { PRODUCT_IMAGE_MESSAGES } from './productImageRules.js';
import { PRODUCT_MESSAGES } from './productSchemas.js';

const OFFLINE = 'Mất kết nối, vui lòng thử lại.';
const GENERIC = 'Đã có lỗi xảy ra. Vui lòng thử lại sau.';
const RATE_LIMITED = 'Bạn thao tác quá nhanh, vui lòng thử lại sau.';
export const PRODUCT_GONE_MESSAGE = 'Sản phẩm không còn tồn tại.';
export const CATEGORY_GONE_MESSAGE = 'Danh mục không còn tồn tại, vui lòng chọn danh mục khác.';

const IMAGE_CODES = {
  FILE_REQUIRED: PRODUCT_IMAGE_MESSAGES.required,
  INVALID_FILE_TYPE: PRODUCT_IMAGE_MESSAGES.type,
  INVALID_IMAGE: PRODUCT_IMAGE_MESSAGES.unreadable,
  FILE_TOO_LARGE: PRODUCT_IMAGE_MESSAGES.size,
  IMAGE_TOO_LARGE: PRODUCT_IMAGE_MESSAGES.tooLarge,
  IMAGE_TOO_SMALL: PRODUCT_IMAGE_MESSAGES.tooSmall,
  INVALID_ASPECT_RATIO: PRODUCT_IMAGE_MESSAGES.ratio,
};
// Trường API -> trường của form.
const FIELD_OF = { name: 'name', priceVnd: 'price', categoryId: 'categoryId', image: 'image' };

/**
 * Lỗi lưu sản phẩm -> cách hiển thị (screens/product-form.md mục 8).
 * - `fields`: lỗi gắn vào ô (`{ name?, price?, categoryId?, image? }`);
 * - `category`: danh mục vừa bị xóa (tải lại danh mục, bỏ chọn, giữ phần còn lại);
 * - `gone`: sản phẩm không còn (chế độ sửa);
 * - `nochange`, `rate`, `alert`.
 * @param {{ code?: string, details?: unknown }} error
 * @param {{ hasImage: boolean }} context request có ảnh hay không (500 không rõ nguyên nhân + có ảnh -> báo lỗi tải ảnh)
 * @returns {{ kind: 'fields', fields: Record<string, string> } | { kind: 'category' | 'gone' | 'nochange' | 'alert' | 'rate', message: string, retryAfterSeconds?: number | null }}
 */
export function mapProductSaveError(error, { hasImage }) {
  const code = error?.code;
  if (code in IMAGE_CODES) return { kind: 'fields', fields: { image: IMAGE_CODES[code] } };

  switch (code) {
    case 'VALIDATION_ERROR': {
      const details = Array.isArray(error.details) ? error.details : [];
      const fields = {};
      for (const { field, message } of details) {
        const key = FIELD_OF[field];
        if (key && !fields[key]) fields[key] = message;
      }
      if (Object.keys(fields).length > 0) return { kind: 'fields', fields };
      if (details.some((d) => d.message === PRODUCT_MESSAGES.noChange)) {
        return { kind: 'nochange', message: PRODUCT_MESSAGES.noChange };
      }
      return { kind: 'alert', message: GENERIC };
    }
    case 'CATEGORY_NOT_FOUND':
      return { kind: 'category', message: CATEGORY_GONE_MESSAGE };
    case 'NOT_FOUND':
      return { kind: 'gone', message: PRODUCT_GONE_MESSAGE };
    case 'TOO_MANY_REQUESTS': {
      const seconds = Number(error.details?.retryAfterSeconds);
      return {
        kind: 'rate',
        message: RATE_LIMITED,
        retryAfterSeconds: Number.isFinite(seconds) && seconds > 0 ? seconds : null,
      };
    }
    case 'UPLOAD_FAILED':
      return { kind: 'alert', message: PRODUCT_IMAGE_MESSAGES.upload };
    case 'NETWORK_ERROR':
      return { kind: 'alert', message: OFFLINE };
    default:
      return { kind: 'alert', message: hasImage ? PRODUCT_IMAGE_MESSAGES.upload : GENERIC };
  }
}

/** Lỗi xóa -> `gone` (404) hoặc `alert` (kể cả 429, hiếm gặp vì DELETE không tính rate limit). */
export function mapProductDeleteError(error) {
  if (error?.code === 'NOT_FOUND') return { kind: 'gone', message: PRODUCT_GONE_MESSAGE };
  if (error?.code === 'TOO_MANY_REQUESTS') return { kind: 'rate', message: RATE_LIMITED };
  return { kind: 'alert', message: error?.code === 'NETWORK_ERROR' ? OFFLINE : GENERIC };
}
