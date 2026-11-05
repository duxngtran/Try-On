import { describe, it, expect } from 'vitest';
import {
  buildBucketOptions,
  ensureProductImageBucket,
  ensureProfilePhotoBucket,
} from '../src/services/storageSetup.js';

const MB = 1024 * 1024;

function fakeClient(existing) {
  const calls = [];
  const storage = {
    async getBucket() {
      return existing
        ? { data: existing, error: null }
        : { data: null, error: { statusCode: '404', message: 'Bucket not found' } };
    },
    async createBucket(name, options) {
      calls.push(['create', name, options]);
      return { data: { name }, error: null };
    },
    async updateBucket(name, options) {
      calls.push(['update', name, options]);
      return { data: { message: 'ok' }, error: null };
    },
  };
  return { client: { storage }, calls };
}

const config = { name: 'profile-photos', maxMb: 10 };
const good = { public: false, file_size_limit: 10 * MB, allowed_mime_types: ['image/jpeg'] };

describe('ensureProfilePhotoBucket (D-26, AC-10)', () => {
  it('bucket luôn private, 10 MB, chỉ JPEG', () => {
    expect(buildBucketOptions({ maxMb: 10 })).toEqual({
      public: false,
      fileSizeLimit: 10 * MB,
      allowedMimeTypes: ['image/jpeg'],
    });
  });

  it('chưa có -> tạo private', async () => {
    const { client, calls } = fakeClient(null);
    expect(await ensureProfilePhotoBucket(client, config)).toBe('created');
    expect(calls).toEqual([
      ['create', 'profile-photos', expect.objectContaining({ public: false })],
    ]);
  });

  it('đã đúng cấu hình -> không làm gì (idempotent)', async () => {
    const { client, calls } = fakeClient(good);
    expect(await ensureProfilePhotoBucket(client, config)).toBe('unchanged');
    expect(calls).toEqual([]);
  });

  it('ai đó lỡ đặt bucket public -> script đặt lại thành private', async () => {
    const { client, calls } = fakeClient({ ...good, public: true });
    expect(await ensureProfilePhotoBucket(client, config)).toBe('updated');
    expect(calls[0][2].public).toBe(false);
  });

  it('bucket sản phẩm: chưa có -> tạo public; lệch -> đặt lại public; đúng -> không làm gì (D-46)', async () => {
    const productConfig = { name: 'product-images', maxMb: 10 };
    const created = fakeClient(null);
    expect(await ensureProductImageBucket(created.client, productConfig)).toBe('created');
    expect(created.calls[0][2]).toMatchObject({ public: true, allowedMimeTypes: ['image/jpeg'] });
    const wrong = fakeClient({ ...good, public: false });
    expect(await ensureProductImageBucket(wrong.client, productConfig)).toBe('updated');
    expect(wrong.calls[0][2].public).toBe(true);
    const right = fakeClient({ ...good, public: true });
    expect(await ensureProductImageBucket(right.client, productConfig)).toBe('unchanged');
  });

  it('lỗi khác 404 (vd. sai key) -> ném lỗi, không tạo bucket', async () => {
    const client = {
      storage: { getBucket: async () => ({ data: null, error: new Error('Invalid API key') }) },
    };
    await expect(ensureProfilePhotoBucket(client, config)).rejects.toThrow('Invalid API key');
  });
});
