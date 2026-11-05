import { describe, it, expect } from 'vitest';
import { categoryBodySchema, validateCategoryName } from './categorySchemas.js';

// BẢNG CASE DÙNG CHUNG với backend/tests/categorySchemas.test.js (D-21): giữ hai bảng giống hệt nhau.
const REQUIRED = 'Vui lòng nhập tên danh mục.';
const LENGTH = 'Tên danh mục phải từ 2 đến 50 ký tự.';
const INVALID = 'Tên danh mục không hợp lệ.';

const NAME_CASES = [
  { name: 'hợp lệ', input: 'Áo thun', expected: 'Áo thun' },
  { name: 'trim và gộp khoảng trắng (AC-02)', input: '  Áo   khoác ', expected: 'Áo khoác' },
  { name: 'tab và xuống dòng thành dấu cách', input: 'Áo\t\nkhoác', expected: 'Áo khoác' },
  { name: 'NFD thành NFC', input: 'Váy', expected: 'Váy' },
  { name: '2 ký tự', input: 'Áo', expected: 'Áo' },
  { name: '50 ký tự', input: 'a'.repeat(50), expected: 'a'.repeat(50) },
  {
    name: '50 ký tự sau gộp khoảng trắng',
    input: `${'a'.repeat(25)}   ${'b'.repeat(24)}`,
    expected: `${'a'.repeat(25)} ${'b'.repeat(24)}`,
  },
  { name: 'rỗng', input: '', error: REQUIRED },
  { name: 'chỉ khoảng trắng', input: ' \t   ', error: REQUIRED },
  { name: '1 ký tự', input: 'A', error: LENGTH },
  { name: '51 ký tự', input: 'a'.repeat(51), error: LENGTH },
  { name: 'ký tự ngoài BMP tính là 1', input: '\u{1F455}', error: LENGTH },
  { name: 'ký tự điều khiển', input: 'Áo\u0007thun', error: INVALID },
  { name: 'ký tự NUL', input: 'Áo\u0000thun', error: INVALID },
  { name: 'kiểu số', input: 123, error: REQUIRED },
  { name: 'null', input: null, error: REQUIRED },
  { name: 'mảng', input: ['Áo'], error: REQUIRED },
];

describe('categoryBodySchema', () => {
  it.each(NAME_CASES)('$name', ({ input, expected, error }) => {
    const result = categoryBodySchema.safeParse({ name: input });
    if (error) {
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe(error);
      expect(result.error.issues[0].path).toEqual(['name']);
    } else {
      expect(result.data).toEqual({ name: expected });
    }
  });

  it('thiếu trường name và trường thừa', () => {
    expect(categoryBodySchema.safeParse({}).error.issues[0].message).toBe(REQUIRED);
    expect(categoryBodySchema.parse({ name: 'Váy', role: 'admin', id: 'x' })).toEqual({
      name: 'Váy',
    });
  });
});

describe('validateCategoryName (trùng tên ở FE)', () => {
  const names = ['Áo thun', 'Váy'];
  it('trùng không phân biệt hoa thường, sau khi chuẩn hóa', () => {
    expect(validateCategoryName('  ÁO   THUN ', { names })).toEqual({
      error: 'Danh mục này đã tồn tại.',
    });
  });
  it('khác dấu thì không trùng ("Vay" khác "Váy")', () => {
    expect(validateCategoryName('Vay', { names })).toEqual({ name: 'Vay' });
  });
});
