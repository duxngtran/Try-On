import { Router } from 'express';
import { health } from '../controllers/healthController.js';
import { adminPing, createAuthController } from '../controllers/authController.js';
import { createProfileController, requirePhotoConsent } from '../controllers/profileController.js';
import { requireRole } from '../middlewares/auth.js';
import { validateBody } from '../middlewares/validate.js';
import { loginSchema, registerSchema } from '../validation/authSchemas.js';
import { consentSchema, measurementsSchema } from '../validation/profileSchemas.js';

/**
 * @param {{
 *   authService: ReturnType<import('../services/authService.js').createAuthService>,
 *   authenticate: import('express').RequestHandler,
 *   authRateLimiter: import('express').RequestHandler,
 *   profile?: {
 *     profileService: ReturnType<import('../services/profileService.js').createProfileService>,
 *     uploadPhoto: import('express').RequestHandler,
 *     photoUploadRateLimiter: import('express').RequestHandler,
 *   },
 * }} [services] Không truyền thì chỉ có `/health` (dùng cho test hạ tầng).
 */
export function createApiRouter(services) {
  const router = Router();
  router.get('/health', health);
  if (!services) return router;

  const { authService, authenticate, authRateLimiter, profile } = services;
  const auth = createAuthController(authService);

  router.post('/auth/register', authRateLimiter, validateBody(registerSchema), auth.register);
  router.post('/auth/login', authRateLimiter, validateBody(loginSchema), auth.login);
  router.get('/auth/me', authenticate, auth.me);

  router.get('/admin/ping', authenticate, requireRole('admin'), adminPing);

  if (profile) {
    // Chỉ role user (D-28); không route nào nhận id user — luôn là hồ sơ của `sub` (AC-11).
    const { profileService, uploadPhoto, photoUploadRateLimiter } = profile;
    const controller = createProfileController(profileService);
    const userOnly = [authenticate, requireRole('user')];

    router.get('/profile', ...userOnly, controller.get);
    router.put(
      '/profile/measurements',
      ...userOnly,
      validateBody(measurementsSchema),
      controller.measurements,
    );
    router.post(
      '/profile/photo-consent',
      ...userOnly,
      validateBody(consentSchema),
      controller.consent,
    );
    // Thứ tự: rate limit (đếm mọi request) -> consent (trước khi nhận file) -> multer -> xử lý.
    router.put(
      '/profile/photo',
      ...userOnly,
      photoUploadRateLimiter,
      requirePhotoConsent(profileService),
      uploadPhoto,
      controller.replacePhoto,
    );
    router.delete('/profile/photo', ...userOnly, controller.deletePhoto);
  }
  return router;
}
