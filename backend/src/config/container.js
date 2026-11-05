import { createAuthService, createDummyHash } from '../services/authService.js';
import { createLoginLock } from '../services/loginLock.js';
import { createTokenService } from '../services/tokenService.js';
import { createCategoryService } from '../services/categoryService.js';
import { createProfileService } from '../services/profileService.js';
import { createProductService } from '../services/productService.js';
import { createProductImageStorage } from '../services/productImageStorage.js';
import { createPhotoStorage } from '../services/storage.js';
import { createAuthenticate } from '../middlewares/auth.js';
import { createAuthRateLimiter } from '../middlewares/authRateLimit.js';
import { createPhotoUploadRateLimiter } from '../middlewares/photoUploadRateLimit.js';
import { createUploadPhoto } from '../middlewares/uploadPhoto.js';
import { createUploadProductImage } from '../middlewares/uploadProductImage.js';
import { createProductWriteRateLimiter } from '../middlewares/productWriteRateLimit.js';

/**
 * Lắp các dependency của auth + hồ sơ (một chỗ duy nhất). Test truyền repository/storage giả.
 * @param {ReturnType<import('./env.js').parseEnv>} env
 * @param {{
 *   userRepository: object,
 *   profileRepository: object,
 *   categoryRepository?: object,
 *   productRepository?: object,
 *   productImageStorage?: object,
 *   processProductImage?: (buffer: Buffer) => Promise<Buffer>,
 *   photoStorage?: object,
 *   supabase?: import('@supabase/supabase-js').SupabaseClient,
 *   processPhoto?: (buffer: Buffer) => Promise<Buffer>,
 *   logger?: Pick<Console, 'error'>,
 *   startSweeper?: boolean,
 * }} options `photoStorage` không truyền thì tạo từ `supabase` + env.
 */
export async function buildServices(
  env,
  {
    userRepository,
    profileRepository,
    categoryRepository,
    productRepository,
    productImageStorage,
    processProductImage,
    photoStorage,
    supabase,
    processPhoto,
    logger,
    startSweeper = false,
  },
) {
  const tokenService = createTokenService({
    secret: env.JWT_SECRET,
    expiresIn: env.JWT_EXPIRES_IN,
  });
  const loginLock = createLoginLock({
    maxFails: env.LOGIN_MAX_FAILS,
    lockMs: env.LOGIN_LOCK_MINUTES * 60_000,
  });
  if (startSweeper) loginLock.startSweeper();

  const dummyHash = await createDummyHash(env.BCRYPT_COST);
  const authService = createAuthService({
    userRepository,
    profileRepository,
    tokenService,
    loginLock,
    bcryptCost: env.BCRYPT_COST,
    dummyHash,
  });

  const storage =
    photoStorage ??
    createPhotoStorage({
      client: supabase,
      bucket: env.PROFILE_PHOTO_BUCKET,
      signedUrlTtlSeconds: env.SIGNED_URL_TTL_SECONDS,
    });

  const imageStorage =
    productImageStorage ??
    (productRepository &&
      createProductImageStorage({
        client: supabase,
        bucket: env.PRODUCT_IMAGE_BUCKET,
        cacheSeconds: env.PRODUCT_IMAGE_CACHE_SECONDS,
      }));

  return {
    authService,
    authenticate: createAuthenticate({ tokenService, userRepository }),
    authRateLimiter: createAuthRateLimiter({ limitPerMinute: env.AUTH_RATE_LIMIT_PER_MIN }),
    categories: categoryRepository && {
      categoryService: createCategoryService({ categoryRepository }),
    },
    products: productRepository && {
      productService: createProductService({
        productRepository,
        imageStorage,
        processImage: processProductImage,
        logger,
      }),
      uploadProductImage: createUploadProductImage({ maxMb: env.PRODUCT_IMAGE_MAX_MB }),
      productWriteRateLimiter: createProductWriteRateLimiter({
        limitPerHour: env.PRODUCT_WRITES_PER_HOUR,
      }),
    },
    profile: {
      profileService: createProfileService({
        profileRepository,
        photoStorage: storage,
        processPhoto,
        logger,
      }),
      uploadPhoto: createUploadPhoto({ maxMb: env.PHOTO_MAX_MB }),
      photoUploadRateLimiter: createPhotoUploadRateLimiter({
        limitPerHour: env.PHOTO_UPLOADS_PER_HOUR,
      }),
    },
  };
}
