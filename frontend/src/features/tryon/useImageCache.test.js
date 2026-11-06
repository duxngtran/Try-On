import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createImageCache } from './useImageCache.js';

const image = (expiresAt = '2099-01-01T00:00:00.000Z') => ({
  url: 'https://storage.test/a.jpg?token=x',
  expiresAt,
  width: 864,
  height: 1296,
});

describe('bộ nhớ ảnh theo (productId, image.version) (US-06 R9)', () => {
  it('đổi ảnh sản phẩm (version mới) thì không trả ảnh cũ', () => {
    const cache = createImageCache();
    cache.set('p1', 1, image());
    expect(cache.get('p1', 1)).not.toBeNull();
    expect(cache.get('p1', 2)).toBeNull();
    expect(cache.get('p2', 1)).toBeNull();
  });

  it('clear xóa hết (403/409, rút consent); drop chỉ xóa một mục', () => {
    const cache = createImageCache();
    cache.set('p1', 1, image());
    cache.set('p2', 1, image());
    cache.drop('p1', 1);
    expect(cache.get('p1', 1)).toBeNull();
    expect(cache.get('p2', 1)).not.toBeNull();
    cache.clear();
    expect(cache.get('p2', 1)).toBeNull();
  });

  describe('hạn của signed URL', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('còn <= 60 giây tới hạn thì coi như không có, tránh hiện URL sắp chết', () => {
      vi.setSystemTime(new Date('2026-11-06T00:00:00.000Z'));
      const cache = createImageCache();
      cache.set('p1', 1, image('2026-11-06T00:01:30.000Z'));
      expect(cache.get('p1', 1)).not.toBeNull();
      vi.setSystemTime(new Date('2026-11-06T00:00:30.001Z'));
      expect(cache.get('p1', 1)).toBeNull();
    });
  });
});
