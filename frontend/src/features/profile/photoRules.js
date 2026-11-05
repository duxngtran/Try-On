export const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp';
export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MIN_WIDTH = 512;
const MIN_HEIGHT = 1024;
const MAX_SIDE = 8000;
const MIN_RATIO = 1.3;
const MAX_RATIO = 2.5;

export const PHOTO_MESSAGES = {
  type: 'Chỉ chấp nhận ảnh JPG, PNG hoặc WEBP.',
  size: 'Ảnh tối đa 10 MB.',
  unreadable: 'Không đọc được ảnh, vui lòng chọn ảnh khác.',
  tooSmall: 'Ảnh cần tối thiểu 512 × 1024 px.',
  tooLarge: 'Ảnh quá lớn, cạnh dài tối đa 8000 px.',
  ratio: 'Vui lòng dùng ảnh dọc chụp toàn thân.',
};

/** Kiểm tra loại và dung lượng trước khi đọc ảnh (D-11). Trả thông báo lỗi hoặc `null`. */
export function checkPhotoFile({ type, size }) {
  if (!ALLOWED_TYPES.has(type)) return PHOTO_MESSAGES.type;
  if (size > PHOTO_MAX_BYTES) return PHOTO_MESSAGES.size;
  return null;
}

/**
 * Kiểm tra kích thước/tỉ lệ theo thứ tự giống backend (quá lớn -> quá nhỏ -> tỉ lệ).
 * Trình duyệt đã tự xoay theo EXIF khi đọc qua `Image`, nên width/height là kích thước hiển thị.
 */
export function checkPhotoDimensions({ width, height }) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return PHOTO_MESSAGES.unreadable;
  }
  if (Math.max(width, height) > MAX_SIDE) return PHOTO_MESSAGES.tooLarge;
  if (width < MIN_WIDTH || height < MIN_HEIGHT) return PHOTO_MESSAGES.tooSmall;
  const ratio = height / width;
  if (ratio < MIN_RATIO || ratio > MAX_RATIO) return PHOTO_MESSAGES.ratio;
  return null;
}
