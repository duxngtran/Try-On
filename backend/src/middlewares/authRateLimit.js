import { rateLimit } from 'express-rate-limit';
import { fail } from '../utils/response.js';

/** Rate limit theo IP cho `/api/auth/register` + `/login` (dùng chung một bộ đếm). 429 luôn có retryAfterSeconds (D-34). */
export function createAuthRateLimiter({ limitPerMinute }) {
  return rateLimit({
    windowMs: 60_000,
    limit: limitPerMinute,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res) => {
      const resetTime = req.rateLimit?.resetTime;
      const retryAfterSeconds = resetTime
        ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
        : 60;
      return fail(res, 429, 'TOO_MANY_REQUESTS', 'Bạn thao tác quá nhanh, vui lòng thử lại sau.', {
        retryAfterSeconds,
      });
    },
  });
}
