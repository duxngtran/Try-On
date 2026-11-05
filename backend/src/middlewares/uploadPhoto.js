import multer from 'multer';
import { AppError } from '../utils/AppError.js';

export const PHOTO_FIELD = 'photo';

/**
 * Nhận đúng 1 file ở field `photo` vào bộ nhớ (D-12), giới hạn dung lượng ngay ở tầng này.
 * Lỗi: quá dung lượng -> 413 FILE_TOO_LARGE; thiếu file -> 400 FILE_REQUIRED;
 * sai tên field / nhiều file / có field chữ / multipart hỏng -> 400 VALIDATION_ERROR.
 * @param {{ maxMb: number }} options
 */
export function createUploadPhoto({ maxMb }) {
  const upload = multer({
    storage: multer.memoryStorage(),
    // fields: 0 -> contract không có field nào khác ngoài file.
    limits: { fileSize: maxMb * 1024 * 1024, files: 1, fields: 0 },
  }).single(PHOTO_FIELD);

  return (req, res, next) => {
    upload(req, res, (err) => {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return next(new AppError(413, 'FILE_TOO_LARGE', `Ảnh tối đa ${maxMb} MB.`));
      }
      if (err) {
        // MulterError khác hoặc lỗi parse multipart (busboy) đều là request sai dạng, không phải lỗi server.
        return next(new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ.'));
      }
      if (!req.file) return next(new AppError(400, 'FILE_REQUIRED', 'Vui lòng chọn ảnh.'));
      return next();
    });
  };
}
