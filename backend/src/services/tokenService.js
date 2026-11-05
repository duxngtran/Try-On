import jwt from 'jsonwebtoken';

const ALGORITHM = 'HS256';

/**
 * Ký/verify JWT (D-05). Payload chỉ gồm `sub`, `role`, `iat`, `exp`.
 * @param {{ secret: string, expiresIn: string }} options
 */
export function createTokenService({ secret, expiresIn }) {
  return {
    sign({ userId, role }) {
      return jwt.sign({ role }, secret, { algorithm: ALGORITHM, subject: userId, expiresIn });
    },

    /**
     * Chỉ chấp nhận HS256 (chặn `alg: none` và đổi thuật toán).
     * @returns {{ ok: true, userId: string } | { ok: false, reason: 'expired' | 'invalid' }}
     */
    verify(token) {
      try {
        const payload = jwt.verify(token, secret, { algorithms: [ALGORITHM] });
        if (typeof payload?.sub !== 'string' || payload.sub.length === 0) {
          return { ok: false, reason: 'invalid' };
        }
        return { ok: true, userId: payload.sub };
      } catch (err) {
        if (err instanceof jwt.TokenExpiredError) return { ok: false, reason: 'expired' };
        return { ok: false, reason: 'invalid' };
      }
    },
  };
}
