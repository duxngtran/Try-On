import { apiClient } from '../../services/apiClient.js';

// Mọi endpoint trả `{ success, data }` và `data` luôn là `Cart` (api.md mục 7.1). Không hàm nào gửi giá, số lượng
// hay id người dùng: chủ giỏ là người đăng nhập (US-07 mục 6).
const unwrap = (res) => res.data.data;

export const cartApi = {
  async getCart({ signal } = {}) {
    return unwrap(await apiClient.get('/cart', { signal }));
  },
  async addItem(productId, { signal } = {}) {
    return unwrap(await apiClient.post('/cart/items', { productId }, { signal }));
  },
  /** Số lượng TUYỆT ĐỐI (không cộng dồn): gửi lại đúng request vẫn ra cùng kết quả. */
  async setQuantity(productId, quantity, { signal } = {}) {
    return unwrap(await apiClient.patch(`/cart/items/${productId}`, { quantity }, { signal }));
  },
  /** Idempotent: dòng đã mất vẫn 200. */
  async removeItem(productId, { signal } = {}) {
    return unwrap(await apiClient.delete(`/cart/items/${productId}`, { signal }));
  },
};
