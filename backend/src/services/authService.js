import bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { AppError } from '../utils/AppError.js';
import { DuplicateEmailError } from '../repositories/userRepository.js';

const EMAIL_EXISTS = () => new AppError(409, 'EMAIL_ALREADY_EXISTS', 'Email này đã được đăng ký.');
const INVALID_CREDENTIALS = () =>
  new AppError(401, 'INVALID_CREDENTIALS', 'Email hoặc mật khẩu không đúng.');

/** Hash giả cùng cost với hash thật; so sánh với nó khi email không tồn tại để thời gian phản hồi tương đương (D-30). */
export function createDummyHash(cost) {
  return bcrypt.hash(randomBytes(24).toString('base64'), cost);
}

/** Dạng user trả cho client; không bao giờ có `password_hash`. */
export function toPublicUser(row) {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    // US-02 (migration 002) sẽ thay bằng giá trị thật từ bảng profiles (D-24).
    profileCompleted: false,
    // Postgres trả `...893014+00:00`; contract yêu cầu ISO 8601 UTC dạng `...893Z`.
    createdAt: new Date(row.created_at).toISOString(),
  };
}

/**
 * @param {{
 *   userRepository: ReturnType<import('../repositories/userRepository.js').createUserRepository>,
 *   tokenService: ReturnType<import('./tokenService.js').createTokenService>,
 *   loginLock: ReturnType<import('./loginLock.js').createLoginLock>,
 *   bcryptCost: number,
 *   dummyHash: string,
 * }} deps
 */
export function createAuthService({
  userRepository,
  tokenService,
  loginLock,
  bcryptCost,
  dummyHash,
}) {
  const issueSession = (row) => ({
    token: tokenService.sign({ userId: row.id, role: row.role }),
    user: toPublicUser(row),
  });

  return {
    /** Đăng ký + tự đăng nhập (D-16). `role` luôn là 'user' (AC-04). */
    async register({ email, password }) {
      if (await userRepository.findByEmailWithHash(email)) throw EMAIL_EXISTS();
      const passwordHash = await bcrypt.hash(password, bcryptCost);
      try {
        const row = await userRepository.create({ email, passwordHash, role: 'user' });
        return issueSession(row);
      } catch (err) {
        if (err instanceof DuplicateEmailError) throw EMAIL_EXISTS();
        throw err;
      }
    },

    async login({ email, password }) {
      const lock = loginLock.check(email);
      if (lock.locked) {
        const minutes = Math.ceil(lock.retryAfterSeconds / 60);
        throw new AppError(
          429,
          'TOO_MANY_ATTEMPTS',
          `Bạn đã thử quá nhiều lần. Vui lòng thử lại sau ${minutes} phút.`,
          { retryAfterSeconds: lock.retryAfterSeconds },
        );
      }
      const row = await userRepository.findByEmailWithHash(email);
      const matches = await bcrypt.compare(password, row?.password_hash ?? dummyHash);
      if (!row || !matches) {
        loginLock.registerFail(email);
        throw INVALID_CREDENTIALS();
      }
      loginLock.clear(email);
      return issueSession(row);
    },

    /** Người dùng hiện tại (đã qua middleware auth). */
    async getCurrentUser(userId) {
      const row = await userRepository.findById(userId);
      if (!row) throw new AppError(401, 'UNAUTHORIZED', 'Vui lòng đăng nhập.');
      return toPublicUser(row);
    },
  };
}
