import { rateLimit } from 'express-rate-limit';
import { tooManyRequestsHandler } from './authRateLimit.js';

/**
 * Giới hạn thêm/sửa sản phẩm theo admin (D-51), đếm mọi request kể cả bị từ chối; DELETE không qua đây.
 * Phải đặt sau `authenticate` và trước multer (chặn trước khi nhận file vào bộ nhớ).
 * Bộ đếm in-memory: reset khi restart server (MVP, một instance).
 */
export function createProductWriteRateLimiter({ limitPerHour }) {
  return rateLimit({
    windowMs: 60 * 60_000,
    limit: limitPerHour,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => req.user.id,
    handler: tooManyRequestsHandler,
  });
}
