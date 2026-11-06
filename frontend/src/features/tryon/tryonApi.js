import { apiClient } from '../../services/apiClient.js';

// Mọi endpoint trả `{ success, data }`; mỗi hàm trả thẳng `data`. Lỗi là ApiError đã chuẩn hóa.
// Không có hàm nào nhận hay gửi id người dùng, URL ảnh hay version (api.md mục 1).
const unwrap = (res) => res.data.data;

export const tryonApi = {
  async getState({ signal } = {}) {
    return unwrap(await apiClient.get('/try-on/state', { signal }));
  },
  async acceptConsent() {
    return unwrap(await apiClient.post('/try-on/consent', { accepted: true }));
  },
  async withdrawConsent() {
    return unwrap(await apiClient.delete('/try-on/consent'));
  },
  async getCategories({ signal } = {}) {
    return unwrap(await apiClient.get('/try-on/categories', { signal })).categories;
  },
  /** Một trong `after`, `before`, `at` (api.md 5.2); con trỏ là chuỗi mờ do server cấp, FE không tự dựng. */
  async getProducts(categoryId, { after, before, at, signal } = {}) {
    const params = {};
    if (after) params.after = after;
    if (before) params.before = before;
    if (at) params.at = at;
    return unwrap(
      await apiClient.get(`/try-on/categories/${categoryId}/products`, { params, signal }),
    );
  },
  async getResult(productId, { signal } = {}) {
    return unwrap(await apiClient.get(`/try-on/products/${productId}/result`, { signal }));
  },
  async createJob(productId, { signal, purpose = 'display' } = {}) {
    return unwrap(
      await apiClient.post(`/try-on/products/${productId}/jobs`, { purpose }, { signal }),
    );
  },
  async getJob(jobId, { signal } = {}) {
    return unwrap(await apiClient.get(`/try-on/jobs/${jobId}`, { signal })).job;
  },
};
