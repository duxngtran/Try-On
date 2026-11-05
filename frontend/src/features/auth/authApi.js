import { apiClient } from '../../services/apiClient.js';

// Mỗi hàm trả `data` của envelope `{ success, data }`; lỗi là ApiError đã chuẩn hóa.
export const authApi = {
  /** @returns {Promise<{ token: string, user: object }>} */
  async register({ email, password }) {
    const res = await apiClient.post('/auth/register', { email, password });
    return res.data.data;
  },
  /** @returns {Promise<{ token: string, user: object }>} */
  async login({ email, password }) {
    const res = await apiClient.post('/auth/login', { email, password });
    return res.data.data;
  },
  /** @returns {Promise<object>} user hiện tại */
  async me({ signal } = {}) {
    const res = await apiClient.get('/auth/me', { signal });
    return res.data.data.user;
  },
  async adminPing() {
    const res = await apiClient.get('/admin/ping');
    return res.data.data;
  },
};
