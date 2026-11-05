import { describe, it, expect } from 'vitest';
import { checkProductImageDimensions, checkProductImageFile } from './productImageRules.js';

describe('checkProductImageDimensions (D-48, AC-03)', () => {
  it.each([
    [512, 512, null], // đúng ngưỡng
    [511, 800, 'Ảnh sản phẩm cần tối thiểu 512 × 512 px.'],
    [800, 511, 'Ảnh sản phẩm cần tối thiểu 512 × 512 px.'],
    [512, 1536, null], // tỉ lệ đúng 3
    [1536, 512, null],
    [512, 1537, 'Ảnh quá dài hoặc quá hẹp, cạnh dài tối đa gấp 3 lần cạnh ngắn.'],
    [600, 2000, 'Ảnh quá dài hoặc quá hẹp, cạnh dài tối đa gấp 3 lần cạnh ngắn.'],
    [8000, 2667, null],
    [600, 9000, 'Ảnh quá lớn, cạnh dài tối đa 8000 px.'], // quá lớn ưu tiên hơn tỉ lệ
    [400, 800, 'Ảnh sản phẩm cần tối thiểu 512 × 512 px.'],
    [0, 0, 'Không đọc được ảnh, vui lòng chọn ảnh khác.'],
    [NaN, 800, 'Không đọc được ảnh, vui lòng chọn ảnh khác.'],
  ])('%i x %i -> %s', (width, height, expected) => {
    expect(checkProductImageDimensions({ width, height })).toBe(expected);
  });
});

describe('checkProductImageFile', () => {
  it('loại và dung lượng', () => {
    expect(checkProductImageFile({ type: 'image/gif', size: 100 })).toBe(
      'Chỉ chấp nhận ảnh JPG, PNG hoặc WEBP.',
    );
    expect(checkProductImageFile({ type: 'image/png', size: 10 * 1024 * 1024 + 1 })).toBe(
      'Ảnh tối đa 10 MB.',
    );
    expect(checkProductImageFile({ type: 'image/webp', size: 10 * 1024 * 1024 })).toBeNull();
  });
});
