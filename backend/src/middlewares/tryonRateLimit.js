import { rateLimit } from 'express-rate-limit';
import { tooManyRequestsHandler } from './authRateLimit.js';

/**
 * Rate limit phòng thử đồ theo user, đếm mọi request kể cả bị từ chối (D-31, D-88). Phải đặt sau `authenticate`.
 * Hai bộ đếm tách nhau: tạo job và đọc, để theo dõi job không làm chặn nhầm việc tạo job.
 * In-memory, chỉ để chống spam: KHÔNG phải chốt của lượt và ngân sách (chốt nằm ở DB).
 */
export function createTryonRateLimiter({ limitPerMinute }) {
  return rateLimit({
    windowMs: 60_000,
    limit: limitPerMinute,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => req.user.id,
    handler: tooManyRequestsHandler,
  });
}
