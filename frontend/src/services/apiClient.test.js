import { describe, it, expect, vi } from 'vitest';
import { createApiClient, ApiError } from './apiClient.js';

// Adapter giả: trả response/lỗi theo kịch bản, không gọi mạng.
const adapterWith = (status, data) => async (config) => {
  const response = { data, status, statusText: '', headers: {}, config, request: {} };
  if (status >= 200 && status < 300) return response;
  const err = new Error(`status ${status}`);
  err.isAxiosError = true;
  err.config = config;
  err.response = response;
  throw err;
};

const errorBody = (code, message = 'Lỗi') => ({ success: false, error: { code, message } });

function setup({ token = 'jwt-123', status = 200, data = { success: true, data: {} } } = {}) {
  const onUnauthorized = vi.fn();
  const client = createApiClient({ baseURL: 'http://api.test/api', getToken: () => token, onUnauthorized });
  client.defaults.adapter = adapterWith(status, data);
  return { client, onUnauthorized };
}

describe('apiClient', () => {
  it('gắn Authorization Bearer khi có token, không gắn khi không có', async () => {
    let seen;
    const withToken = setup();
    withToken.client.defaults.adapter = async (config) => {
      seen = config.headers.get('Authorization');
      return adapterWith(200, {})(config);
    };
    await withToken.client.get('/x');
    expect(seen).toBe('Bearer jwt-123');

    const noToken = setup({ token: null });
    noToken.client.defaults.adapter = async (config) => {
      seen = config.headers.get('Authorization');
      return adapterWith(200, {})(config);
    };
    await noToken.client.get('/x');
    expect(seen).toBeUndefined();
  });

  it('401 (token hết hạn) gọi handler đúng 1 lần và reject ApiError chuẩn hóa', async () => {
    const { client, onUnauthorized } = setup({ status: 401, data: errorBody('TOKEN_EXPIRED', 'Phiên hết hạn') });
    await expect(client.get('/auth/me')).rejects.toMatchObject({ status: 401, code: 'TOKEN_EXPIRED' });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('401 INVALID_CREDENTIALS (đăng nhập sai) không bị coi là hết phiên', async () => {
    const { client, onUnauthorized } = setup({ status: 401, data: errorBody('INVALID_CREDENTIALS') });
    await expect(client.post('/auth/login', {})).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('401 khi request không gửi token không kích hoạt handler', async () => {
    const { client, onUnauthorized } = setup({ token: null, status: 401, data: errorBody('UNAUTHORIZED') });
    await expect(client.get('/x')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('giữ error.details (lỗi theo trường, retryAfterSeconds)', async () => {
    const details = [{ field: 'email', message: 'Sai' }];
    const { client } = setup({
      status: 400,
      data: { success: false, error: { code: 'VALIDATION_ERROR', message: 'x', details } },
    });
    await expect(client.post('/x', {})).rejects.toMatchObject({ status: 400, details });
  });

  it('mất mạng -> NETWORK_ERROR với thông báo thân thiện', async () => {
    const { client } = setup();
    client.defaults.adapter = async (config) => {
      const err = new Error('Network Error');
      err.isAxiosError = true;
      err.config = config;
      throw err;
    };
    await expect(client.get('/x')).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });
});
