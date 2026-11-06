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
  async getProducts(categoryId, { signal } = {}) {
    return unwrap(await apiClient.get(`/try-on/categories/${categoryId}/products`, { signal }));
  },
  async getResult(productId, { signal } = {}) {
    return unwrap(await apiClient.get(`/try-on/products/${productId}/result`, { signal }));
  },
  async createJob(productId, { signal } = {}) {
    return unwrap(
      await apiClient.post(
        `/try-on/products/${productId}/jobs`,
        { purpose: 'display' },
        { signal },
      ),
    );
  },
  async getJob(jobId, { signal } = {}) {
    return unwrap(await apiClient.get(`/try-on/jobs/${jobId}`, { signal })).job;
  },
};
