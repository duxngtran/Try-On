import { ZodError } from 'zod';
import { AppError } from '../utils/AppError.js';
import { fail } from '../utils/response.js';

const MSG = {
  VALIDATION_ERROR: 'Dữ liệu không hợp lệ.',
  PAYLOAD_TOO_LARGE: 'Dữ liệu gửi lên quá lớn.',
  FILE_TOO_LARGE: 'Ảnh vượt quá dung lượng cho phép.',
  NOT_FOUND: 'Không tìm thấy tài nguyên.',
  INTERNAL_ERROR: 'Đã có lỗi xảy ra. Vui lòng thử lại sau.',
};

/** Mỗi trường chỉ giữ lỗi đầu tiên (FE hiện một lỗi dưới mỗi ô). */
export function zodIssuesToDetails(error) {
  const seen = new Set();
  const details = [];
  for (const issue of error.issues) {
    const field = issue.path.join('.');
    if (seen.has(field)) continue;
    seen.add(field);
    details.push({ field, message: issue.message });
  }
  return details;
}

/** Chuyển mọi lỗi về `{ status, code, message, details? }`; lỗi không biết -> 500 INTERNAL_ERROR. */
export function normalizeError(err) {
  if (err instanceof AppError) {
    return { status: err.status, code: err.code, message: err.message, details: err.details };
  }
  if (err instanceof ZodError) {
    return {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: MSG.VALIDATION_ERROR,
      details: zodIssuesToDetails(err),
    };
  }
  // body-parser (express.json)
  if (err?.type === 'entity.too.large') {
    return { status: 413, code: 'PAYLOAD_TOO_LARGE', message: MSG.PAYLOAD_TOO_LARGE };
  }
  if (err?.type === 'entity.parse.failed' || err?.type === 'encoding.unsupported') {
    return { status: 400, code: 'VALIDATION_ERROR', message: MSG.VALIDATION_ERROR };
  }
  // multer
  if (err?.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return { status: 413, code: 'FILE_TOO_LARGE', message: MSG.FILE_TOO_LARGE };
    }
    return { status: 400, code: 'VALIDATION_ERROR', message: MSG.VALIDATION_ERROR };
  }
  return { status: 500, code: 'INTERNAL_ERROR', message: MSG.INTERNAL_ERROR };
}

/**
 * Error handler tập trung (D-29). Không bao giờ trả stack/chi tiết nội bộ cho client.
 * @param {{ isProduction: boolean, logger?: Pick<Console, 'error'> }} options
 */
export function createErrorHandler({ isProduction, logger = console }) {
  // Express nhận diện error handler qua đủ 4 tham số.
  return (err, req, res, next) => {
    if (res.headersSent) return next(err);
    const normalized = normalizeError(err);
    if (normalized.status >= 500) {
      // Không log body/headers (có thể chứa mật khẩu, token, số đo).
      logger.error(isProduction ? `${err?.name}: ${err?.message}` : err);
    }
    const retryAfter = normalized.details?.retryAfterSeconds;
    if (normalized.status === 429 && Number.isFinite(retryAfter)) {
      res.set('Retry-After', String(retryAfter));
    }
    return fail(res, normalized.status, normalized.code, normalized.message, normalized.details);
  };
}

export function notFoundHandler(req, res) {
  return fail(res, 404, 'NOT_FOUND', MSG.NOT_FOUND);
}
