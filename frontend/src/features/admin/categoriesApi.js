import { apiClient } from '../../services/apiClient.js';

// Lỗi là ApiError đã chuẩn hóa (`status`, `code`, `message`, `details`).
export const categoriesApi = {
  async list({ signal } = {}) {
    const res = await apiClient.get('/admin/categories', { signal });
    return res.data.data.categories;
  },
  async create(name) {
    const res = await apiClient.post('/admin/categories', { name });
    return res.data.data.category;
  },
  async rename(id, name) {
    const res = await apiClient.patch(`/admin/categories/${id}`, { name });
    return res.data.data.category;
  },
  async remove(id) {
    const res = await apiClient.delete(`/admin/categories/${id}`);
    return res.data.data;
  },
};
