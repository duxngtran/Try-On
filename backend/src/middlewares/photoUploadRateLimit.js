import { rateLimit } from 'express-rate-limit';
import { tooManyRequestsHandler } from './authRateLimit.js';

/**
 * Giới hạn upload ảnh theo user (D-31), đếm mọi request kể cả bị từ chối. Phải đặt sau `authenticate`.
 * Bộ đếm in-memory: reset khi restart server (chấp nhận ở MVP, một instance).
 */
export function createPhotoUploadRateLimiter({ limitPerHour }) {
  return rateLimit({
    windowMs: 60 * 60_000,
    limit: limitPerHour,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => req.user.id,
    handler: tooManyRequestsHandler,
  });
}
