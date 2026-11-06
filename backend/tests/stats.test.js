import { describe, it, expect } from 'vitest';
import { percentile } from '../scripts/lib/stats.js';

describe('percentile (tryon:report)', () => {
  it('nearest-rank: p50 và p95 của 20 mẫu', () => {
    const sorted = Array.from({ length: 20 }, (_, i) => (i + 1) * 1000);
    expect(percentile(sorted, 50)).toBe(10_000);
    expect(percentile(sorted, 95)).toBe(19_000);
    expect(percentile(sorted, 100)).toBe(20_000);
  });

  it('một mẫu thì mọi phân vị là mẫu đó; không có mẫu thì null (không chia cho 0)', () => {
    expect(percentile([7], 95)).toBe(7);
    expect(percentile([], 50)).toBeNull();
  });
});
