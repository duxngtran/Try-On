import { apiClient } from '../../services/apiClient.js';

export const PRODUCTS_PAGE_SIZE = 20;
const UPLOAD_TIMEOUT_MS = 120_000;

/** Tiến trình tải lên theo phần trăm; `onProgress` không được gọi khi trình duyệt không biết tổng dung lượng. */
const progressHandler = (onProgress) =>
  onProgress
    ? (event) => {
        if (event.total) onProgress(Math.round((event.loaded * 100) / event.total));
      }
    : undefined;

/**
 * Thêm/sửa gửi một request multipart (D-50). Không nhận `signal`: không có nút hủy tải (D-57).
 * Để axios tự đặt Content-Type kèm boundary.
 * @param {{ name?: string, priceVnd?: number, categoryId?: string }} fields chỉ các trường cần gửi
 * @param {File | null} file
 */
export function buildProductFormData(fields, file) {
  const form = new FormData();
  if (fields.name !== undefined) form.append('name', fields.name);
  if (fields.priceVnd !== undefined) form.append('priceVnd', String(fields.priceVnd));
  if (fields.categoryId !== undefined) form.append('categoryId', fields.categoryId);
  if (file) form.append('image', file);
  return form;
}

// Lỗi là ApiError đã chuẩn hóa (`status`, `code`, `message`, `details`).
export const productsApi = {
  /** @returns {Promise<{ items: object[], pagination: { page: number, limit: number, total: number, totalPages: number } }>} */
  async list({ page = 1, categoryId = null, signal } = {}) {
    const params = { page, limit: PRODUCTS_PAGE_SIZE };
    if (categoryId) params.categoryId = categoryId;
    const res = await apiClient.get('/admin/products', { params, signal });
    return res.data.data;
  },
  async get(id, { signal } = {}) {
    const res = await apiClient.get(`/admin/products/${id}`, { signal });
    return res.data.data.product;
  },
  /** @param {{ fields: object, file: File, onProgress?: (percent: number) => void }} options */
  async create({ fields, file, onProgress }) {
    const res = await apiClient.post('/admin/products', buildProductFormData(fields, file), {
      timeout: UPLOAD_TIMEOUT_MS,
      onUploadProgress: progressHandler(onProgress),
    });
    return res.data.data.product;
  },
  /** @param {{ id: string, fields: object, file?: File | null, onProgress?: (percent: number) => void }} options */
  async update({ id, fields, file = null, onProgress }) {
    const res = await apiClient.patch(`/admin/products/${id}`, buildProductFormData(fields, file), {
      timeout: UPLOAD_TIMEOUT_MS,
      onUploadProgress: file ? progressHandler(onProgress) : undefined,
    });
    return res.data.data.product;
  },
  async remove(id) {
    const res = await apiClient.delete(`/admin/products/${id}`);
    return res.data.data;
  },
};
