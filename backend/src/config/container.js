import { createAuthService, createDummyHash } from '../services/authService.js';
import { createLoginLock } from '../services/loginLock.js';
import { createTokenService } from '../services/tokenService.js';
import { createCategoryService } from '../services/categoryService.js';
import { createProfileService } from '../services/profileService.js';
import { createProductService } from '../services/productService.js';
import { createProductImageStorage } from '../services/productImageStorage.js';
import { createPhotoStorage } from '../services/storage.js';
import { createCartService } from '../services/cartService.js';
import { createCartRateLimiter } from '../middlewares/cartRateLimit.js';
import { createTryonService } from '../services/tryonService.js';
import { createProviderFromEnv } from '../services/tryon/providerFactory.js';
import { createProviderGate } from '../services/tryon/providerGate.js';
import { createTryonCleanup } from '../services/tryon/cleanup.js';
import { createTryonWorker } from '../services/tryon/worker.js';
import { normalizeResult, prepareModelImage } from '../services/tryon/tryonImage.js';
import { createTryonRateLimiter } from '../middlewares/tryonRateLimit.js';
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
 *   cartRepository?: object,
 *   productImageStorage?: object,
 *   processProductImage?: (buffer: Buffer) => Promise<Buffer>,
 *   photoStorage?: object,
 *   supabase?: import('@supabase/supabase-js').SupabaseClient,
 *   processPhoto?: (buffer: Buffer) => Promise<Buffer>,
 *   tryonRepository?: object,
 *   tryonStorage?: object,
 *   provider?: import('../services/tryon/provider.js').TryOnProvider,
 *   logger?: Pick<Console, 'error'>,
 *   startSweeper?: boolean,
 *   startWorker?: boolean,
 * }} options `photoStorage` không truyền thì tạo từ `supabase` + env.
 */
export async function buildServices(
  env,
  {
    userRepository,
    profileRepository,
    categoryRepository,
    productRepository,
    cartRepository,
    productImageStorage,
    processProductImage,
    photoStorage,
    supabase,
    processPhoto,
    tryonRepository,
    tryonStorage: tryonStorageOverride,
    provider: providerOverride,
    logger,
    startSweeper = false,
    startWorker = false,
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

  // Phòng thử đồ (sprint 03). Chỉ lắp khi có repository và ảnh sản phẩm (tryon cần danh sách sản phẩm).
  let tryon;
  if (tryonRepository && imageStorage) {
    const tryonStorage =
      tryonStorageOverride ??
      createPhotoStorage({
        client: supabase,
        bucket: env.TRYON_IMAGE_BUCKET,
        signedUrlTtlSeconds: env.SIGNED_URL_TTL_SECONDS,
      });
    const providerGate = createProviderGate({ pauseSeconds: env.TRYON_PROVIDER_PAUSE_SECONDS });
    const provider =
      providerOverride ??
      createProviderFromEnv(env, {
        findProductName: async (id) => (await productRepository?.findById(id))?.name,
      });
    const cleanup = createTryonCleanup({
      repository: tryonRepository,
      storage: tryonStorage,
      logger,
      tickSeconds: env.TRYON_CLEANUP_TICK_SECONDS,
    });
    const worker = createTryonWorker({
      repository: tryonRepository,
      provider,
      profileStorage: storage,
      tryonStorage,
      productImageUrl: (path) => imageStorage.publicUrl(path),
      image: { prepareModelImage, normalizeResult },
      gate: providerGate,
      cleanup,
      settings: {
        tickMs: env.TRYON_WORKER_TICK_MS,
        retryDelaySeconds: env.TRYON_RETRY_DELAY_SECONDS,
        maxAttempts: env.TRYON_MAX_ATTEMPTS,
        modelImageMaxSide: env.FASHN_MODEL_IMAGE_MAX_SIDE,
        maxResultBytes: env.TRYON_IMAGE_MAX_MB * 1024 * 1024,
        claimBatch: env.TRYON_SYSTEM_CONCURRENCY,
      },
      logger,
    });
    if (startWorker) {
      worker.start();
      cleanup.start();
    }
    tryon = {
      tryonService: createTryonService({
        tryonRepository,
        categoryRepository,
        tryonStorage,
        productImageStorage: imageStorage,
        providerGate,
        limits: { dailyLimit: env.TRYON_DAILY_LIMIT, monthlyLimit: env.TRYON_MONTHLY_LIMIT },
        flags: { enabled: env.TRYON_ENABLED, prefetchEnabled: env.TRYON_PREFETCH_ENABLED },
        wakeWorker: () => worker.wake(),
        kickCleanup: () => cleanup.kick(),
        logger,
      }),
      tryonReadRateLimiter: createTryonRateLimiter({ limitPerMinute: env.TRYON_READS_PER_MIN }),
      tryonCreateRateLimiter: createTryonRateLimiter({
        limitPerMinute: env.TRYON_JOB_CREATES_PER_MIN,
      }),
      worker,
      cleanup,
      provider,
      providerGate,
    };
  }

  return {
    tryon,
    /** Dừng worker và dọn dẹp (shutdown, và cuối test/script để tiến trình không treo). */
    async stop() {
      await tryon?.worker.stop();
      await tryon?.cleanup.stop();
    },
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
        tryonCleanup: tryon?.cleanup,
        logger,
      }),
      uploadProductImage: createUploadProductImage({ maxMb: env.PRODUCT_IMAGE_MAX_MB }),
      productWriteRateLimiter: createProductWriteRateLimiter({
        limitPerHour: env.PRODUCT_WRITES_PER_HOUR,
      }),
    },
    cart: cartRepository &&
      imageStorage && {
        cartService: createCartService({ cartRepository, imageStorage }),
        cartRateLimiter: createCartRateLimiter({ limitPerMinute: env.CART_REQUESTS_PER_MIN }),
      },
    profile: {
      profileService: createProfileService({
        profileRepository,
        photoStorage: storage,
        processPhoto,
        tryonCleanup: tryon?.cleanup,
        logger,
      }),
      uploadPhoto: createUploadPhoto({ maxMb: env.PHOTO_MAX_MB }),
      photoUploadRateLimiter: createPhotoUploadRateLimiter({
        limitPerHour: env.PHOTO_UPLOADS_PER_HOUR,
      }),
    },
  };
}
