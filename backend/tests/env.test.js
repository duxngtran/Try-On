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

  it('biến phòng thử đồ: mặc định an toàn (adapter giả, bật), cờ chuỗi "false" thật sự tắt (T-61)', () => {
    const env = parseEnv(valid);
    expect(env.TRYON_PROVIDER).toBe('fake');
    expect([env.TRYON_ENABLED, env.TRYON_PREFETCH_ENABLED]).toEqual([true, true]);
    expect([env.TRYON_DAILY_LIMIT, env.TRYON_MONTHLY_LIMIT, env.TRYON_MONTHLY_BUDGET_USD]).toEqual([
      20, 100, 50,
    ]);
    expect(env.TRYON_COST_PER_IMAGE_USD).toBe(0.075);
    expect(env.FASHN_API_KEY).toBeUndefined();
    // z.coerce.boolean sẽ biến 'false' thành true: đây là lỗi dễ mắc nhất của công tắc tắt ngay.
    expect(parseEnv({ ...valid, TRYON_ENABLED: 'false' }).TRYON_ENABLED).toBe(false);
    expect(() => parseEnv({ ...valid, TRYON_ENABLED: 'no' })).toThrow(/TRYON_ENABLED/);
  });

  it('biến phòng thử đồ sai kiểu hoặc sai miền thì không khởi động (T-61)', () => {
    expect(() => parseEnv({ ...valid, TRYON_DAILY_LIMIT: 'nhieu' })).toThrow(/TRYON_DAILY_LIMIT/);
    expect(() => parseEnv({ ...valid, TRYON_MONTHLY_BUDGET_USD: '0' })).toThrow(
      /TRYON_MONTHLY_BUDGET_USD/,
    );
    expect(() => parseEnv({ ...valid, TRYON_BUDGET_WARN_PERCENT: '101' })).toThrow(
      /TRYON_BUDGET_WARN_PERCENT/,
    );
    expect(() => parseEnv({ ...valid, TRYON_PROVIDER: 'openai' })).toThrow(/TRYON_PROVIDER/);
  });

  it('chốt chặn 1: TRYON_PROVIDER=fashn thiếu hoặc rỗng FASHN_API_KEY thì không khởi động', () => {
    expect(() => parseEnv({ ...valid, TRYON_PROVIDER: 'fashn' })).toThrow(/FASHN_API_KEY/);
    expect(() => parseEnv({ ...valid, TRYON_PROVIDER: 'fashn', FASHN_API_KEY: '' })).toThrow(
      /FASHN_API_KEY/,
    );
    const env = parseEnv({ ...valid, TRYON_PROVIDER: 'fashn', FASHN_API_KEY: 'k' });
    expect(env.TRYON_PROVIDER).toBe('fashn');
  });

  it('chốt chặn 2: NODE_ENV=test không bao giờ dùng fashn, dù có key; lỗi không in key', () => {
    let message = '';
    try {
      parseEnv({
        ...valid,
        NODE_ENV: 'test',
        TRYON_PROVIDER: 'fashn',
        FASHN_API_KEY: 'key-bi-mat-123',
      });
    } catch (e) {
      message = e.message;
    }
    expect(message).toMatch(/TRYON_PROVIDER/);
    expect(message).not.toMatch(/key-bi-mat-123/);
    expect(parseEnv({ ...valid, NODE_ENV: 'test', TRYON_PROVIDER: 'fake' }).TRYON_PROVIDER).toBe(
      'fake',
    );
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
