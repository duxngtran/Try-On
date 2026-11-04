import { Router } from 'express';
import { health } from '../controllers/healthController.js';
import { adminPing, createAuthController } from '../controllers/authController.js';
import { requireRole } from '../middlewares/auth.js';
import { validateBody } from '../middlewares/validate.js';
import { loginSchema, registerSchema } from '../validation/authSchemas.js';

/**
 * @param {{
 *   authService: ReturnType<import('../services/authService.js').createAuthService>,
 *   authenticate: import('express').RequestHandler,
 *   authRateLimiter: import('express').RequestHandler,
 * }} [services] Không truyền thì chỉ có `/health` (dùng cho test hạ tầng).
 */
export function createApiRouter(services) {
  const router = Router();
  router.get('/health', health);
  if (!services) return router;

  const { authService, authenticate, authRateLimiter } = services;
  const auth = createAuthController(authService);

  router.post('/auth/register', authRateLimiter, validateBody(registerSchema), auth.register);
  router.post('/auth/login', authRateLimiter, validateBody(loginSchema), auth.login);
  router.get('/auth/me', authenticate, auth.me);

  router.get('/admin/ping', authenticate, requireRole('admin'), adminPing);
  // Router hồ sơ (/profile/*, auth + requireRole('user')) gắn ở US-02.
  return router;
}
