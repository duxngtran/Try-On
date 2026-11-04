import axios from 'axios';
import { tokenStorage } from './tokenStorage.js';

/** Lỗi đã chuẩn hóa từ API: `{ status, code, message, details? }` (D-29). */
export class ApiError extends Error {
  constructor({ status, code, message, details }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const NETWORK_MESSAGE = 'Không thể kết nối. Vui lòng kiểm tra mạng và thử lại.';
const FALLBACK_MESSAGE = 'Đã có lỗi xảy ra. Vui lòng thử lại sau.';

/** Chuyển lỗi axios về ApiError (không lộ chi tiết kỹ thuật). */
export function normalizeApiError(error) {
  if (error instanceof ApiError) return error;
  if (axios.isCancel(error)) return new ApiError({ status: 0, code: 'CANCELED', message: '' });
  const response = error?.response;
  if (!response)
    return new ApiError({ status: 0, code: 'NETWORK_ERROR', message: NETWORK_MESSAGE });
  const apiError = response.data?.error;
  return new ApiError({
    status: response.status,
    code: apiError?.code ?? 'INTERNAL_ERROR',
    message: apiError?.message ?? FALLBACK_MESSAGE,
    details: apiError?.details,
  });
}

/**
 * Tạo API client. Gắn `Authorization: Bearer` khi có token; 401 xử lý tập trung (D-18).
 * @param {{
 *   baseURL?: string,
 *   getToken?: () => string | null,
 *   onUnauthorized?: (error: ApiError) => void,
 * }} options
 */
export function createApiClient({ baseURL, getToken = tokenStorage.get, onUnauthorized } = {}) {
  const instance = axios.create({ baseURL, timeout: 30_000 });

  instance.interceptors.request.use((config) => {
    const token = getToken();
    if (token) config.headers.set('Authorization', `Bearer ${token}`);
    return config;
  });

  instance.interceptors.response.use(
    (response) => response,
    (error) => {
      const apiError = normalizeApiError(error);
      // Chỉ coi là hết phiên khi request có gửi token; INVALID_CREDENTIALS là đăng nhập sai, không phải hết phiên.
      const hadToken = Boolean(error?.config?.headers?.get?.('Authorization'));
      if (apiError.status === 401 && apiError.code !== 'INVALID_CREDENTIALS' && hadToken) {
        onUnauthorized?.(apiError);
      }
      return Promise.reject(apiError);
    },
  );

  return instance;
}

let unauthorizedHandler = null;
/** AuthProvider (US-01) đăng ký handler: xóa token, chuyển về /login kèm thông báo hết phiên. */
export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler;
}

/** Client dùng chung toàn app. Trả về `response.data` = `{ success, data }`. */
export const apiClient = createApiClient({
  baseURL: import.meta.env.VITE_API_URL,
  onUnauthorized: (error) => unauthorizedHandler?.(error),
});
