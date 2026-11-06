import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach } from 'vitest';
import { appRouteObjects } from '../routes/appRouteObjects.jsx';
import { apiClient } from '../services/apiClient.js';
import { TOKEN_KEY } from '../services/tokenStorage.js';

export const USER = { id: 'u1', email: 'a@example.com', role: 'user', profileCompleted: true };
export const NEW_USER = { ...USER, profileCompleted: false };
export const ADMIN = {
  id: 'a1',
  email: 'admin@example.com',
  role: 'admin',
  profileCompleted: false,
};

/** Giỏ hàng theo api.md 7.1; `items` là các `CartItem`, các số tổng tính từ đó trừ khi truyền đè. */
export function makeCart(items = [], overrides = {}) {
  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);
  return {
    items,
    itemCount,
    lineCount: items.length,
    totalVnd: items.reduce((sum, i) => sum + (i.lineTotalVnd ?? 0), 0),
    hasUnavailable: items.some((i) => i.available === false),
    fingerprint: items.length ? 'f'.repeat(32) : null,
    limits: { maxQuantity: 10, maxLines: 30 },
    ...overrides,
  };
}

export const ok = (data, status = 200) => ({ status, data: { success: true, data } });
export const fail = (status, code, message = 'Lỗi', details) => ({
  status,
  data: { success: false, error: { code, message, ...(details ? { details } : {}) } },
});

const originalAdapter = apiClient.defaults.adapter;
afterEach(() => {
  apiClient.defaults.adapter = originalAdapter;
  localStorage.clear();
});

/**
 * Dựng app thật (router + AuthProvider + guard + apiClient + interceptor) và chỉ giả lập tầng
 * mạng bằng axios adapter. `routes`: `{ 'METHOD /path': response | (body) => response }`.
 * `calls` ghi lại mọi request (`{ key, body }`) để kiểm tra payload.
 */
export function renderApp(path, { token, routes = {} } = {}) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  const calls = [];
  apiClient.defaults.adapter = async (config) => {
    const key = `${config.method.toUpperCase()} ${config.url}`;
    // FormData (upload ảnh) không phải JSON: ghi lại nguyên đối tượng.
    const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
    calls.push({ key, body, params: config.params });
    // Giỏ rỗng mặc định: người mua nào đăng nhập cũng gọi GET /cart một lần khi vào app.
    const handler = routes[key] ?? (key === 'GET /cart' ? ok(makeCart()) : undefined);
    if (!handler) throw new Error(`Chưa giả lập ${key}`);
    // Handler có thể trả Promise để giữ response lại (kiểm request chồng nhau, đổi sản phẩm giữa chừng).
    const result = await (typeof handler === 'function' ? handler(body, config) : handler);
    if (result.networkError) {
      // Mất mạng: axios báo lỗi không có `response`.
      throw Object.assign(new Error('Network Error'), { isAxiosError: true, config });
    }
    const { status, data } = result;
    const response = { data, status, statusText: '', headers: {}, config, request: {} };
    if (status < 400) return response;
    const error = new Error(`status ${status}`);
    error.isAxiosError = true;
    error.config = config;
    error.response = response;
    throw error;
  };
  // Data router như production (D-60), để các trang dùng được `useBlocker`.
  const router = createMemoryRouter(appRouteObjects, {
    initialEntries: Array.isArray(path) ? path : [path],
  });
  const view = render(<RouterProvider router={router} />);
  return { ...view, router, calls, user: userEvent.setup() };
}
