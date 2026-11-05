import { apiClient } from '../../services/apiClient.js';

const UPLOAD_TIMEOUT_MS = 120_000;

// Mọi endpoint hồ sơ trả `{ profile }` đầy đủ; mỗi hàm trả thẳng `profile`. Lỗi là ApiError đã chuẩn hóa.
export const profileApi = {
  async get({ signal } = {}) {
    const res = await apiClient.get('/profile', { signal });
    return res.data.data.profile;
  },
  async saveMeasurements({ heightCm, weightKg }) {
    const res = await apiClient.put('/profile/measurements', { heightCm, weightKg });
    return res.data.data.profile;
  },
  async acceptConsent() {
    const res = await apiClient.post('/profile/photo-consent', { accepted: true });
    return res.data.data.profile;
  },
  /** @param {{ file: File, onProgress?: (percent: number) => void, signal?: AbortSignal }} options */
  async uploadPhoto({ file, onProgress, signal }) {
    const form = new FormData();
    form.append('photo', file);
    const res = await apiClient.put('/profile/photo', form, {
      signal,
      timeout: UPLOAD_TIMEOUT_MS,
      onUploadProgress: (event) => {
        if (event.total) onProgress?.(Math.round((event.loaded * 100) / event.total));
      },
    });
    return res.data.data.profile;
  },
  async deletePhoto() {
    const res = await apiClient.delete('/profile/photo');
    return res.data.data.profile;
  },
};
