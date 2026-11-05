import { AppError } from '../utils/AppError.js';

const UNAUTHORIZED = () => new AppError(401, 'UNAUTHORIZED', 'Vui lòng đăng nhập.');
const BEARER = /^Bearer\s+(\S+)$/i;

/**
 * Middleware xác thực: kiểm tra JWT rồi kiểm tra user còn tồn tại; `role` lấy từ DB, không từ token.
 * Luồng: design/flows/auth-middleware.md
 * @param {{
 *   tokenService: { verify(token: string): { ok: true, userId: string } | { ok: false, reason: string } },
 *   userRepository: { findById(id: string): Promise<{ id: string, email: string, role: string } | null> },
 * }} deps
 */
export function createAuthenticate({ tokenService, userRepository }) {
  return async (req, res, next) => {
    const match = BEARER.exec(req.get('Authorization') ?? '');
    if (!match) throw UNAUTHORIZED();

    const result = tokenService.verify(match[1]);
    if (!result.ok) {
      if (result.reason === 'expired') {
        throw new AppError(
          401,
          'TOKEN_EXPIRED',
          'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.',
        );
      }
      throw UNAUTHORIZED();
    }

    const user = await userRepository.findById(result.userId);
    if (!user) throw UNAUTHORIZED();

    req.user = { id: user.id, email: user.email, role: user.role };
    next();
  };
}

/** Chỉ cho các role liệt kê; phải đặt sau `authenticate`. */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw new AppError(403, 'FORBIDDEN', 'Bạn không có quyền truy cập.');
    }
    next();
  };
}
