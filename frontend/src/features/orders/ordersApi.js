import { apiClient } from '../../services/apiClient.js';

const unwrap = (res) => res.data.data;

/**
 * Chỉ gửi khóa, fingerprint và ba trường nhận hàng. Không bao giờ gửi giá, tổng tiền, tên sản phẩm (api.md mục 1).
 * Mất response thì gọi lại với CÙNG `idempotencyKey`: server trả đúng đơn cũ, không tạo đơn thứ hai.
 */
export const ordersApi = {
  async place({ idempotencyKey, cartFingerprint, recipient }, { signal } = {}) {
    return unwrap(
      await apiClient.post('/orders', { idempotencyKey, cartFingerprint, recipient }, { signal }),
    );
  },
  async list({ page, signal } = {}) {
    return unwrap(await apiClient.get('/orders', { params: { page }, signal }));
  },
  async get(id, { signal } = {}) {
    return unwrap(await apiClient.get(`/orders/${id}`, { signal }));
  },
};
