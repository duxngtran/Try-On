import { ok } from '../utils/response.js';

/**
 * Chủ giỏ luôn là `req.user.id` (từ token): API không nhận id người dùng, giá hay số lượng từ client.
 * @param {ReturnType<import('../services/cartService.js').createCartService>} cartService
 */
export function createCartController(cartService) {
  return {
    get: async (req, res) => ok(res, await cartService.getCart(req.user.id)),
    addItem: async (req, res) =>
      ok(res, await cartService.addItem(req.user.id, req.body.productId)),
  };
}
