import { createAuthService, createDummyHash } from '../services/authService.js';
import { createLoginLock } from '../services/loginLock.js';
import { createTokenService } from '../services/tokenService.js';
import { createAuthenticate } from '../middlewares/auth.js';
import { createAuthRateLimiter } from '../middlewares/authRateLimit.js';

/**
 * Lắp các dependency của auth (một chỗ duy nhất). Test truyền `userRepository` giả.
 * @param {ReturnType<import('./env.js').parseEnv>} env
 * @param {{ userRepository: object, startSweeper?: boolean }} options
 */
export async function buildAuthServices(env, { userRepository, startSweeper = false }) {
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
    tokenService,
    loginLock,
    bcryptCost: env.BCRYPT_COST,
    dummyHash,
  });
  return {
    authService,
    authenticate: createAuthenticate({ tokenService, userRepository }),
    authRateLimiter: createAuthRateLimiter({ limitPerMinute: env.AUTH_RATE_LIMIT_PER_MIN }),
  };
}
