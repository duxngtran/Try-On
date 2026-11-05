import { describe, it, expect } from 'vitest';
import {
  createProductBodySchema,
  listProductsQuerySchema,
  priceVndSchema,
  productNameSchema,
  updateProductBodySchema,
} from '../src/validation/productSchemas.js';

// Bảng case dùng chung với frontend (D-21): frontend/src/features/admin/productSchemas.test.js.
const PRICE_CASES = [
  ['999', null],
  ['1000', 1000],
  ['199000', 199000],
  ['100000000', 100000000],
  ['100000001', null],
  ['199.5', null],
  ['-1000', null],
  ['abc', null],
  ['', null],
  [' 1000', null],
  ['1000 ', null],
  ['0001000', 1000],
  ['9'.repeat(400), null],
];
const NAME_CASES = [
  ['a', null],
  ['ab', 'ab'],
  ['x'.repeat(120), 'x'.repeat(120)],
  ['x'.repeat(121), null],
  ['   ', null],
  ['  Áo   thun \t trắng ', 'Áo thun trắng'],
  ['Áo thun', 'Áo thun'], // NFD -> NFC
  ['Áo\u0007', null], // ký tự điều khiển
  ['😀'.repeat(120), '😀'.repeat(120)], // đếm theo code point, khớp char_length của Postgres
  ['😀'.repeat(121), null],
];

describe('priceVndSchema (D-47)', () => {
  it.each(PRICE_CASES)('%j -> %j', (input, expected) => {
    const result = priceVndSchema.safeParse(input);
    if (expected === null) expect(result.success).toBe(false);
    else expect(result.data).toBe(expected);
  });

  it('kiểu số (không phải chuỗi) bị từ chối: multipart chỉ gửi chuỗi', () => {
    expect(priceVndSchema.safeParse(199000).success).toBe(false);
  });
});

describe('productNameSchema (D-54)', () => {
  it.each(NAME_CASES)('%j -> %j', (input, expected) => {
    const result = productNameSchema.safeParse(input);
    if (expected === null) expect(result.success).toBe(false);
    else expect(result.data).toBe(expected);
  });
});

describe('create / update body', () => {
  const id = '3f2b8c1e-5a4d-4b6f-9c7e-1a2b3c4d5e6f';

  it('create: thiếu trường nào cũng lỗi, trường thừa bị bỏ', () => {
    const ok = { name: 'Áo', priceVnd: '1000', categoryId: id };
    expect(createProductBodySchema.parse({ ...ok, extra: 'x' })).toEqual({
      name: 'Áo',
      priceVnd: 1000,
      categoryId: id,
    });
    for (const key of Object.keys(ok)) {
      const copy = { ...ok };
      delete copy[key];
      expect(createProductBodySchema.safeParse(copy).success).toBe(false);
    }
    expect(createProductBodySchema.safeParse({ ...ok, categoryId: 'abc' }).success).toBe(false);
  });

  it('update: body rỗng hợp lệ ở tầng schema; trường có mặt phải hợp lệ (name rỗng là lỗi)', () => {
    expect(updateProductBodySchema.parse({})).toEqual({});
    expect(updateProductBodySchema.safeParse({ name: '' }).success).toBe(false);
    expect(updateProductBodySchema.safeParse({ priceVnd: '12.5' }).success).toBe(false);
    expect(updateProductBodySchema.parse({ priceVnd: '249000' })).toEqual({ priceVnd: 249000 });
  });
});

describe('listProductsQuerySchema (AC-11)', () => {
  it('mặc định page 1, limit 20', () => {
    expect(listProductsQuerySchema.parse({})).toEqual({ page: 1, limit: 20 });
  });

  it.each([
    [{ page: '0' }],
    [{ page: '-1' }],
    [{ page: '1.5' }],
    [{ page: 'abc' }],
    [{ limit: '0' }],
    [{ limit: '101' }],
    [{ categoryId: 'abc' }],
    [{ page: ['1', '2'] }],
  ])('%j bị từ chối', (query) => {
    expect(listProductsQuerySchema.safeParse(query).success).toBe(false);
  });

  it('biên hợp lệ: limit 1 và 100', () => {
    expect(listProductsQuerySchema.parse({ limit: '100', page: '3' })).toEqual({
      page: 3,
      limit: 100,
    });
    expect(listProductsQuerySchema.parse({ limit: '1' }).limit).toBe(1);
  });
});
