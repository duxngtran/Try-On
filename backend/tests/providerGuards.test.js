import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createProviderFromEnv } from '../src/services/tryon/providerFactory.js';
import { parseEnv } from '../src/config/env.js';

const valid = {
  CORS_ORIGIN: 'http://localhost:5173',
  SUPABASE_URL: 'https://abc.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  JWT_SECRET: 'x'.repeat(32),
};

describe('chốt chặn chống gọi dịch vụ thật (tryon-provider.md mục 2)', () => {
  it('chốt chặn 2: tests/postman/run.js ép TRYON_PROVIDER=fake và xóa key cho tiến trình server', async () => {
    const source = await readFile(new URL('./postman/run.js', import.meta.url), 'utf8');
    expect(source).toMatch(/TRYON_PROVIDER:\s*'fake'/);
    expect(source).toMatch(/FASHN_API_KEY:\s*''/);
  });

  it('mặc định chọn adapter giả; tạo adapter fashn với fetchImpl giả không gọi mạng', () => {
    expect(createProviderFromEnv(parseEnv(valid)).name).toBe('fake');
    const fashnEnv = parseEnv({ ...valid, TRYON_PROVIDER: 'fashn', FASHN_API_KEY: 'k' });
    const calls = [];
    const provider = createProviderFromEnv(fashnEnv, { fetchImpl: (...a) => calls.push(a) });
    expect(provider.name).toBe('fashn');
    expect(calls).toEqual([]); // tạo adapter không gọi mạng
  });
});
