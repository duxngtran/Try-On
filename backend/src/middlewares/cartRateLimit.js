import { rateLimit } from 'express-rate-limit';
import { tooManyRequestsHandler } from './authRateLimit.js';

/**
 * Rate limit giỏ hàng theo user: một bộ đếm cho mọi route `/cart*`, đếm cả request bị từ chối (D-31, D-149).
 * Phải đặt sau `authenticate`. In-memory, chỉ chống spam: chốt số lượng và số dòng nằm ở DB.
 */
export function createCartRateLimiter({ limitPerMinute }) {
  return rateLimit({
    windowMs: 60_000,
    limit: limitPerMinute,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => req.user.id,
    handler: tooManyRequestsHandler,
  });
}
