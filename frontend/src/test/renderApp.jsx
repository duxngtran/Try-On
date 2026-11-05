import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach } from 'vitest';
import { AuthProvider } from '../features/auth/AuthProvider.jsx';
import { AppRoutes } from '../routes/AppRoutes.jsx';
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
    calls.push({ key, body });
    const handler = routes[key];
    if (!handler) throw new Error(`Chưa giả lập ${key}`);
    const { status, data } = typeof handler === 'function' ? handler(body) : handler;
    const response = { data, status, statusText: '', headers: {}, config, request: {} };
    if (status < 400) return response;
    const error = new Error(`status ${status}`);
    error.isAxiosError = true;
    error.config = config;
    error.response = response;
    throw error;
  };
  const view = render(
    <MemoryRouter initialEntries={Array.isArray(path) ? path : [path]}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </MemoryRouter>,
  );
  return { ...view, calls, user: userEvent.setup() };
}
