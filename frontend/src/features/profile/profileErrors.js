import { PHOTO_MESSAGES } from './photoRules.js';

const UPLOAD_FAILED = 'Tải ảnh thất bại, vui lòng thử lại.';
const OFFLINE = 'Mất kết nối, vui lòng thử lại.';
const GENERIC = 'Có lỗi xảy ra, vui lòng thử lại.';
const RATE_LIMIT_NO_WAIT = 'Bạn đã tải ảnh quá nhiều lần trong 1 giờ, vui lòng thử lại sau.';
const RATE_LIMITED = 'Bạn thao tác quá nhanh, vui lòng thử lại sau.';

// File bị từ chối vì chính nội dung file: bỏ ảnh xem trước vừa chọn (ảnh đã lưu giữ nguyên).
const BAD_FILE_MESSAGES = {
  FILE_REQUIRED: 'Vui lòng chọn ảnh.',
  INVALID_FILE_TYPE: PHOTO_MESSAGES.type,
  FILE_TOO_LARGE: PHOTO_MESSAGES.size,
  IMAGE_TOO_SMALL: PHOTO_MESSAGES.tooSmall,
  IMAGE_TOO_LARGE: PHOTO_MESSAGES.tooLarge,
  INVALID_ASPECT_RATIO: PHOTO_MESSAGES.ratio,
  INVALID_IMAGE: PHOTO_MESSAGES.unreadable,
};

/**
 * Lỗi tải ảnh -> cách hiển thị (screens/profile.md, bảng map mã lỗi).
 * @returns {{
 *   kind: 'consent' | 'alert' | 'rate',
 *   variant: 'danger' | 'warning',
 *   message: string,
 *   discardPreview: boolean,
 *   retryAfterSeconds: number | null,
 * }}
 */
export function mapPhotoError(error) {
  const base = { kind: 'alert', variant: 'danger', discardPreview: false, retryAfterSeconds: null };
  const code = error?.code;
  if (code === 'CONSENT_REQUIRED') {
    return {
      ...base,
      kind: 'consent',
      message: 'Vui lòng đồng ý điều khoản sử dụng ảnh trước khi tải lên.',
    };
  }
  if (code in BAD_FILE_MESSAGES) {
    return { ...base, message: BAD_FILE_MESSAGES[code], discardPreview: true };
  }
  if (code === 'TOO_MANY_REQUESTS') {
    const seconds = Number(error?.details?.retryAfterSeconds);
    const hasWait = Number.isFinite(seconds) && seconds > 0;
    return {
      ...base,
      kind: 'rate',
      variant: 'warning',
      message: hasWait ? RATE_LIMITED : RATE_LIMIT_NO_WAIT,
      retryAfterSeconds: hasWait ? seconds : null,
    };
  }
  if (code === 'NETWORK_ERROR') return { ...base, message: OFFLINE };
  return { ...base, message: UPLOAD_FAILED };
}

/** Lỗi lưu số đo / xóa ảnh: lỗi theo ô (`heightCm`, `weightKg`) hoặc một thông báo chung. */
export function mapActionError(error) {
  const fieldErrors = {};
  if (error?.code === 'VALIDATION_ERROR' && Array.isArray(error.details)) {
    for (const d of error.details) {
      if (d.field === 'heightCm' || d.field === 'weightKg') fieldErrors[d.field] ??= d.message;
    }
  }
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors, general: null };
  return { fieldErrors, general: error?.code === 'NETWORK_ERROR' ? OFFLINE : GENERIC };
}
