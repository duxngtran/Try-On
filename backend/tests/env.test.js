import { describe, it, expect } from 'vitest';
import { parseEnv } from '../src/config/env.js';

const valid = {
  CORS_ORIGIN: 'http://localhost:5173',
  SUPABASE_URL: 'https://abc.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  JWT_SECRET: 'x'.repeat(32),
};

describe('parseEnv', () => {
  it('áp dụng mặc định và ép kiểu số', () => {
    const env = parseEnv({ ...valid, PORT: '5000' });
    expect(env.PORT).toBe(5000);
    expect(env.JWT_EXPIRES_IN).toBe('7d');
    expect(env.PHOTO_MAX_MB).toBe(10);
    expect(env.BCRYPT_COST).toBe(10);
  });

  it('biến ảnh sản phẩm: thiếu thì dùng mặc định, sai kiểu thì không khởi động (T-45)', () => {
    const env = parseEnv(valid);
    expect([
      env.PRODUCT_IMAGE_BUCKET,
      env.PRODUCT_IMAGE_MAX_MB,
      env.PRODUCT_IMAGE_CACHE_SECONDS,
      env.PRODUCT_WRITES_PER_HOUR,
    ]).toEqual(['product-images', 10, 604800, 120]);
    expect(() => parseEnv({ ...valid, PRODUCT_WRITES_PER_HOUR: 'nhieu' })).toThrow(
      /PRODUCT_WRITES_PER_HOUR/,
    );
    expect(() => parseEnv({ ...valid, PRODUCT_IMAGE_MAX_MB: '0' })).toThrow(/PRODUCT_IMAGE_MAX_MB/);
  });

  it('JWT_SECRET ngắn hơn 32 ký tự bị từ chối', () => {
    expect(() => parseEnv({ ...valid, JWT_SECRET: 'x'.repeat(31) })).toThrow(/JWT_SECRET/);
  });

  it('BCRYPT_COST < 10 bị từ chối (D-06)', () => {
    expect(() => parseEnv({ ...valid, BCRYPT_COST: '9' })).toThrow(/BCRYPT_COST/);
  });

  it('thiếu biến bắt buộc: lỗi nêu tên biến nhưng không in giá trị secret', () => {
    const rest = { ...valid };
    delete rest.SUPABASE_URL;
    let message = '';
    try {
      parseEnv({ ...rest, JWT_SECRET: 'short-secret-value' });
    } catch (e) {
      message = e.message;
    }
    expect(message).toMatch(/SUPABASE_URL/);
    expect(message).not.toMatch(/short-secret-value/);
  });
});
