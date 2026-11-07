import { rateLimit } from 'express-rate-limit';
import { tooManyRequestsHandler } from './authRateLimit.js';

const limiter = (windowMs, limit) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => req.user.id,
    handler: tooManyRequestsHandler,
  });

/**
 * Rate limit đơn hàng theo user, đếm mọi request kể cả bị từ chối (D-31, D-148). Phải đặt sau `authenticate`.
 * Hai bộ đếm tách nhau: tạo đơn (theo giờ) và đọc đơn (theo phút).
 * In-memory, chỉ chống spam: KHÔNG phải chốt chống đặt trùng hay giá (chốt nằm ở DB).
 */
export const createOrderCreateRateLimiter = ({ limitPerHour }) =>
  limiter(60 * 60_000, limitPerHour);
export const createOrderReadRateLimiter = ({ limitPerMinute }) => limiter(60_000, limitPerMinute);
