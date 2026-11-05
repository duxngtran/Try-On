import { ok } from '../utils/response.js';

/** @param {ReturnType<import('../services/authService.js').createAuthService>} authService */
export function createAuthController(authService) {
  return {
    register: async (req, res) => ok(res, await authService.register(req.body), 201),
    login: async (req, res) => ok(res, await authService.login(req.body)),
    me: async (req, res) => ok(res, { user: await authService.getCurrentUser(req.user.id) }),
  };
}

export const adminPing = (req, res) => ok(res, { pong: true, role: req.user.role });
