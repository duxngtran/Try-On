import multer from 'multer';
import { AppError } from '../utils/AppError.js';

export const PRODUCT_IMAGE_FIELD = 'image';
const MAX_TEXT_FIELDS = 3; // name, priceVnd, categoryId
const MAX_TEXT_FIELD_BYTES = 1024;

const invalid = () => new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ.');

/**
 * Đọc multipart của thêm/sửa sản phẩm vào bộ nhớ (D-50). Không tin Content-Type/tên file của part.
 * Lỗi: không phải multipart / sai tên field / nhiều file / quá 3 field chữ / field chữ > 1 KB / multipart hỏng
 * -> 400 VALIDATION_ERROR; file quá dung lượng -> 413 FILE_TOO_LARGE.
 * Thiếu file không phải lỗi ở đây (PATCH cho phép; POST kiểm ở service để giữ thứ tự ưu tiên lỗi).
 * @param {{ maxMb: number }} options
 */
export function createUploadProductImage({ maxMb }) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: maxMb * 1024 * 1024,
      files: 1,
      fields: MAX_TEXT_FIELDS,
      fieldSize: MAX_TEXT_FIELD_BYTES,
    },
  }).single(PRODUCT_IMAGE_FIELD);

  return (req, res, next) => {
    if (!req.is('multipart/form-data')) return next(invalid());
    return upload(req, res, (err) => {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return next(new AppError(413, 'FILE_TOO_LARGE', `Ảnh tối đa ${maxMb} MB.`));
      }
      if (err) return next(invalid());
      return next();
    });
  };
}
