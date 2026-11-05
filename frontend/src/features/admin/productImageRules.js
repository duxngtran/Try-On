import { checkPhotoFile } from '../profile/photoRules.js';

// Quy tắc sơ bộ cho ảnh flat lay (D-48); backend kiểm tra lại toàn bộ và là nơi quyết định (D-21).
const MIN_SIDE = 512;
const MAX_SIDE = 8000;
const MAX_RATIO = 3;

export const PRODUCT_IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp';

export const PRODUCT_IMAGE_MESSAGES = {
  required: 'Vui lòng chọn ảnh sản phẩm.',
  type: 'Chỉ chấp nhận ảnh JPG, PNG hoặc WEBP.',
  size: 'Ảnh tối đa 10 MB.',
  unreadable: 'Không đọc được ảnh, vui lòng chọn ảnh khác.',
  tooSmall: 'Ảnh sản phẩm cần tối thiểu 512 × 512 px.',
  tooLarge: 'Ảnh quá lớn, cạnh dài tối đa 8000 px.',
  ratio: 'Ảnh quá dài hoặc quá hẹp, cạnh dài tối đa gấp 3 lần cạnh ngắn.',
  upload: 'Tải ảnh thất bại, vui lòng thử lại.',
};

/** Loại và dung lượng, kiểm trước khi đọc ảnh. Trả thông báo lỗi hoặc `null`. */
export const checkProductImageFile = (file) => checkPhotoFile(file);

/**
 * Kích thước/tỉ lệ theo thứ tự giống backend (quá lớn -> quá nhỏ -> tỉ lệ). Cạnh dài / cạnh ngắn <= 3,
 * không bắt buộc dọc hay ngang. `width`/`height` là kích thước hiển thị (trình duyệt đã áp EXIF).
 */
export function checkProductImageDimensions({ width, height }) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return PRODUCT_IMAGE_MESSAGES.unreadable;
  }
  if (Math.max(width, height) > MAX_SIDE) return PRODUCT_IMAGE_MESSAGES.tooLarge;
  if (Math.min(width, height) < MIN_SIDE) return PRODUCT_IMAGE_MESSAGES.tooSmall;
  if (Math.max(width, height) > Math.min(width, height) * MAX_RATIO) {
    return PRODUCT_IMAGE_MESSAGES.ratio;
  }
  return null;
}

/** 1234567 -> "1,2 MB" */
export function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}
