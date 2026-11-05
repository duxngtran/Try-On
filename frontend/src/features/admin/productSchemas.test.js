import { describe, it, expect } from 'vitest';
import {
  buildListSearch,
  normalizeListParams,
  parsePriceInput,
  priceVndSchema,
  productNameSchema,
  validateProductFields,
} from './productSchemas.js';

// BẢNG CASE DÙNG CHUNG với backend/tests/productSchemas.test.js (D-21): giữ hai bảng giống hệt nhau.
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
  ['😀'.repeat(120), '😀'.repeat(120)],
  ['😀'.repeat(121), null],
];

describe('bảng case dùng chung với backend', () => {
  it.each(PRICE_CASES)('giá API %j -> %j', (input, expected) => {
    const result = priceVndSchema.safeParse(input);
    if (expected === null) expect(result.success).toBe(false);
    else expect(result.data).toBe(expected);
  });

  it.each(NAME_CASES)('tên %j -> %j', (input, expected) => {
    const result = productNameSchema.safeParse(input);
    if (expected === null) expect(result.success).toBe(false);
    else expect(result.data).toBe(expected);
  });
});

describe('parsePriceInput: giá người nhập trên form (US-04 §6.1)', () => {
  it.each([
    ['199000', 199000],
    ['199.000', 199000],
    ['199,000', 199000],
    ['199 000', 199000],
    ['1.000.000', 1000000],
    ['1,000,000', 1000000],
    ['100.000.000', 100000000],
    ['  199.000  ', 199000],
    ['1000', 1000],
    ['1.000', 1000],
  ])('%j nhận -> %i', (raw, value) => {
    expect(parsePriceInput(raw)).toEqual({ value });
  });

  it.each([
    ['199.5'], // không tự hiểu thành 1995
    ['1.99'], // không tự hiểu thành 199
    ['1,5'],
    ['1.000,000'], // trộn hai loại dấu
    ['1.00.000'], // nhóm sai
    ['1.0000'],
    ['.000'],
    ['199.000.'],
    [''],
    ['   '],
    ['abc'],
    ['-1.000'],
    ['199000đ'],
    ['999'],
    ['0'],
    ['100.000.001'],
  ])('%j bị từ chối với đúng thông báo', (raw) => {
    expect(parsePriceInput(raw)).toEqual({
      error: 'Giá phải là số nguyên từ 1.000 đến 100.000.000 đồng.',
    });
  });

  it('không bao giờ trả số thập phân hay NaN', () => {
    for (const raw of ['199.5', '1.99', '12,50', '1e6', '0x10']) {
      expect(parsePriceInput(raw)).toHaveProperty('error');
    }
  });
});

describe('validateProductFields', () => {
  it('trả lỗi theo từng ô và dữ liệu đã chuẩn hóa cho ô hợp lệ', () => {
    const { errors, data } = validateProductFields({
      name: ' Áo   thun ',
      price: '199.5',
      categoryId: '',
    });
    expect(Object.keys(errors).sort()).toEqual(['categoryId', 'price']);
    expect(data).toEqual({ name: 'Áo thun' });
  });

  it('hợp lệ cả ba ô', () => {
    const { errors, data } = validateProductFields({
      name: 'Áo',
      price: '249.000',
      categoryId: 'c1',
    });
    expect(errors).toEqual({});
    expect(data).toEqual({ name: 'Áo', priceVnd: 249000, categoryId: 'c1' });
  });
});

describe('trạng thái danh sách trên URL (D-61)', () => {
  const params = (s) => new URLSearchParams(s);
  const id = '3f2b8c1e-5a4d-4b6f-9c7e-1a2b3c4d5e6f';

  it('chuẩn hóa tham số sai trước khi gọi API', () => {
    expect(normalizeListParams(params(''))).toEqual({ page: 1, categoryId: null });
    expect(normalizeListParams(params('page=0&categoryId=abc'))).toEqual({
      page: 1,
      categoryId: null,
    });
    expect(normalizeListParams(params('page=-3'))).toEqual({ page: 1, categoryId: null });
    expect(normalizeListParams(params('page=2.5'))).toEqual({ page: 1, categoryId: null });
    expect(normalizeListParams(params(`page=3&categoryId=${id}`))).toEqual({
      page: 3,
      categoryId: id,
    });
  });

  it('giá trị mặc định bị bỏ khỏi URL', () => {
    expect(buildListSearch({ page: 1, categoryId: null })).toBe('');
    expect(buildListSearch({ page: 2, categoryId: null })).toBe('?page=2');
    expect(buildListSearch({ page: 1, categoryId: id })).toBe(`?categoryId=${id}`);
    expect(buildListSearch({ page: 2, categoryId: id })).toBe(`?categoryId=${id}&page=2`);
  });
});
