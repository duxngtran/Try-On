import { rateLimit } from 'express-rate-limit';
import { fail } from '../utils/response.js';

/** Trả 429 TOO_MANY_REQUESTS kèm retryAfterSeconds (D-34); error handler chung không đụng tới, header Retry-After đặt ở đây. */
export function tooManyRequestsHandler(req, res) {
  const resetTime = req.rateLimit?.resetTime;
  const retryAfterSeconds = resetTime
    ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
    : 60;
  res.set('Retry-After', String(retryAfterSeconds));
  return fail(res, 429, 'TOO_MANY_REQUESTS', 'Bạn thao tác quá nhanh, vui lòng thử lại sau.', {
    retryAfterSeconds,
  });
}

/** Rate limit theo IP cho `/api/auth/register` + `/login` (dùng chung một bộ đếm). 429 luôn có retryAfterSeconds (D-34). */
export function createAuthRateLimiter({ limitPerMinute }) {
  return rateLimit({
    windowMs: 60_000,
    limit: limitPerMinute,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: tooManyRequestsHandler,
  });
}
