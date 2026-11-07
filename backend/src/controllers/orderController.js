import { ok } from '../utils/response.js';
import { listOrdersQuerySchema } from '../validation/orderSchemas.js';

/**
 * Chủ đơn luôn là `req.user.id` (từ token): API không nhận id người dùng, giá hay tổng tiền từ client.
 * @param {ReturnType<import('../services/orderService.js').createOrderService>} orderService
 */
export function createOrderController(orderService) {
  return {
    place: async (req, res) => {
      const { order, created } = await orderService.place(req.user.id, req.body);
      // 201: đơn mới. 200: trả lại đơn cũ của cùng idempotencyKey (E8).
      return ok(res, order, created ? 201 : 200);
    },
    list: async (req, res) =>
      ok(res, await orderService.list(req.user.id, listOrdersQuerySchema.parse(req.query))),
    get: async (req, res) => ok(res, await orderService.getOrder(req.user.id, req.params.id)),
  };
}

/** Đơn chứa họ tên, số điện thoại, địa chỉ: trình duyệt dùng chung không được giữ lại (api.md mục 1). */
export const noStore = (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
};
