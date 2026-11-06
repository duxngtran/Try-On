import { Router } from 'express';
import { health } from '../controllers/healthController.js';
import { adminPing, createAuthController } from '../controllers/authController.js';
import { createCategoryController } from '../controllers/categoryController.js';
import { createProductController } from '../controllers/productController.js';
import { createProfileController, requirePhotoConsent } from '../controllers/profileController.js';
import { createTryonController } from '../controllers/tryonController.js';
import { requireRole } from '../middlewares/auth.js';
import { validateBody } from '../middlewares/validate.js';
import { validateUuidParam } from '../middlewares/validateUuidParam.js';
import { categoryBodySchema } from '../validation/categorySchemas.js';
import { loginSchema, registerSchema } from '../validation/authSchemas.js';
import { consentSchema, measurementsSchema } from '../validation/profileSchemas.js';
import { consentBodySchema, createJobBodySchema } from '../validation/tryonSchemas.js';

/**
 * @param {{
 *   authService: ReturnType<import('../services/authService.js').createAuthService>,
 *   authenticate: import('express').RequestHandler,
 *   authRateLimiter: import('express').RequestHandler,
 *   categories?: {
 *     categoryService: ReturnType<import('../services/categoryService.js').createCategoryService>,
 *   },
 *   products?: {
 *     productService: ReturnType<import('../services/productService.js').createProductService>,
 *     uploadProductImage: import('express').RequestHandler,
 *     productWriteRateLimiter: import('express').RequestHandler,
 *   },
 *   profile?: {
 *     profileService: ReturnType<import('../services/profileService.js').createProfileService>,
 *     uploadPhoto: import('express').RequestHandler,
 *     photoUploadRateLimiter: import('express').RequestHandler,
 *   },
 *   tryon?: {
 *     tryonService: ReturnType<import('../services/tryonService.js').createTryonService>,
 *     tryonReadRateLimiter: import('express').RequestHandler,
 *     tryonCreateRateLimiter: import('express').RequestHandler,
 *   },
 * }} [services] Không truyền thì chỉ có `/health` (dùng cho test hạ tầng).
 */
export function createApiRouter(services) {
  const router = Router();
  router.get('/health', health);
  if (!services) return router;

  const { authService, authenticate, authRateLimiter, categories, products, profile, tryon } =
    services;
  const auth = createAuthController(authService);

  router.post('/auth/register', authRateLimiter, validateBody(registerSchema), auth.register);
  router.post('/auth/login', authRateLimiter, validateBody(loginSchema), auth.login);
  router.get('/auth/me', authenticate, auth.me);

  router.get('/admin/ping', authenticate, requireRole('admin'), adminPing);

  if (categories) {
    // Thứ tự kiểm tra: 401 -> 403 -> 404 id -> body (api.md mục 1).
    const controller = createCategoryController(categories.categoryService);
    const adminOnly = [authenticate, requireRole('admin')];
    const categoryId = validateUuidParam('Không tìm thấy danh mục.');

    router.get('/admin/categories', ...adminOnly, controller.list);
    router.post(
      '/admin/categories',
      ...adminOnly,
      validateBody(categoryBodySchema),
      controller.create,
    );
    router.patch(
      '/admin/categories/:id',
      ...adminOnly,
      categoryId,
      validateBody(categoryBodySchema),
      controller.rename,
    );
    router.delete('/admin/categories/:id', ...adminOnly, categoryId, controller.remove);
  }

  if (products) {
    // Thứ tự: auth -> role -> uuid -> rate limit (đếm mọi request) -> multer (nhận file) -> controller.
    const { productService, uploadProductImage, productWriteRateLimiter } = products;
    const controller = createProductController(productService);
    const adminOnly = [authenticate, requireRole('admin')];
    const productId = validateUuidParam('Sản phẩm không còn tồn tại.');

    router.get('/admin/products', ...adminOnly, controller.list);
    router.get('/admin/products/:id', ...adminOnly, productId, controller.get);
    router.post(
      '/admin/products',
      ...adminOnly,
      productWriteRateLimiter,
      uploadProductImage,
      controller.create,
    );
    router.patch(
      '/admin/products/:id',
      ...adminOnly,
      productId,
      productWriteRateLimiter,
      uploadProductImage,
      controller.update,
    );
    router.delete('/admin/products/:id', ...adminOnly, productId, controller.remove);
  }

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

  if (tryon) {
    // Chỉ role user (D-14, D-28). Thứ tự: auth -> role -> uuid (404) -> rate limit (đếm mọi request) -> body.
    const { tryonService, tryonReadRateLimiter: read, tryonCreateRateLimiter: create } = tryon;
    const controller = createTryonController(tryonService);
    const userOnly = [authenticate, requireRole('user')];
    const categoryId = validateUuidParam('Danh mục không còn tồn tại.', 'categoryId');
    const productId = validateUuidParam('Sản phẩm này không còn bán.', 'productId');
    const jobId = validateUuidParam('Không tìm thấy tác vụ.', 'jobId');

    router.get('/try-on/state', ...userOnly, read, controller.state);
    router.post(
      '/try-on/consent',
      ...userOnly,
      read,
      validateBody(consentBodySchema),
      controller.acceptConsent,
    );
    router.delete('/try-on/consent', ...userOnly, read, controller.withdrawConsent);
    router.get('/try-on/categories', ...userOnly, read, controller.categories);
    router.get(
      '/try-on/categories/:categoryId/products',
      ...userOnly,
      categoryId,
      read,
      controller.products,
    );
    router.get(
      '/try-on/products/:productId/result',
      ...userOnly,
      productId,
      read,
      controller.result,
    );
    router.post(
      '/try-on/products/:productId/jobs',
      ...userOnly,
      productId,
      create,
      validateBody(createJobBodySchema),
      controller.createJob,
    );
    router.get('/try-on/jobs/:jobId', ...userOnly, jobId, read, controller.job);
  }
  return router;
}
