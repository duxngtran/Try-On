import { describe, expect, it } from 'vitest';
import { makeIdempotencyKey } from './orderFormat.js';
import { normalizeForDisplay, validateRecipient } from './orderSchemas.js';

// Bảng case này được chép nguyên từ backend/tests/orderSchemas.test.js (D-21). Sửa một nơi thì sửa nơi kia.
// Mỗi dòng: [trường, đầu vào, kết quả chuẩn hóa hoặc null nếu phải bị từ chối].
const CASES = [
  ['phone', '0912345678', '0912345678'],
  ['phone', '+84 912 345 678', '0912345678'],
  ['phone', '091.234.5678', '0912345678'],
  ['phone', '(091) 234-5678', '0912345678'],
  ['phone', '84912345678', '0912345678'],
  ['phone', '0312345678', '0312345678'],
  ['phone', '0212345678', null], // đầu 02: máy bàn
  ['phone', '0112345678', null],
  ['phone', '091234567', null], // thiếu số
  ['phone', '09123456789', null], // thừa số
  ['phone', '+1 202 555 0100', null],
  ['phone', '09123456a8', null],
  ['phone', '', null],
  ['name', 'Nguyễn Văn A', 'Nguyễn Văn A'],
  ['name', '  Nguyễn   Văn\tA  ', 'Nguyễn Văn A'],
  ['name', 'Ab', 'Ab'],
  ['name', 'A', null],
  ['name', '   ', null],
  ['name', 'a'.repeat(100), 'a'.repeat(100)],
  ['name', 'a'.repeat(101), null],
  ['name', 'Nguyen\u0000A', null], // ký tự điều khiển
  ['name', '😀'.repeat(100), '😀'.repeat(100)], // đếm theo code point như char_length
  ['name', '😀'.repeat(101), null],
  ['address', '12 Lê Lợi, Quận 1', '12 Lê Lợi, Quận 1'],
  ['address', '12 Lê Lợi,\n  Quận 1', '12 Lê Lợi, Quận 1'],
  ['address', 'a'.repeat(10), 'a'.repeat(10)],
  ['address', 'a'.repeat(9), null],
  ['address', 'a'.repeat(300), 'a'.repeat(300)],
  ['address', 'a'.repeat(301), null],
  ['address', 'Số 12\u0007 Lê Lợi', null],
];

const base = { name: 'Nguyễn Văn A', phone: '0912345678', address: '12 Lê Lợi, Quận 1' };

describe('validateRecipient: bảng case dùng chung với backend', () => {
  it.each(CASES)('%s %j -> %j', (field, input, expected) => {
    const result = validateRecipient({ ...base, [field]: input });
    if (expected === null) {
      expect(result.ok).toBe(false);
      expect(Object.keys(result.errors)).toEqual([field]);
    } else {
      expect(result.ok).toBe(true);
      expect(result.recipient[field]).toBe(expected);
    }
  });

  it('thông báo lỗi đúng chữ của thiết kế, gắn đúng ô', () => {
    const result = validateRecipient({ name: '', phone: 'x', address: '' });
    expect(result.errors).toEqual({
      name: 'Vui lòng nhập họ tên người nhận (2–100 ký tự).',
      phone: 'Số điện thoại không hợp lệ.',
      address: 'Vui lòng nhập địa chỉ đầy đủ (10–300 ký tự).',
    });
  });
});

describe('chuẩn hóa khi rời ô', () => {
  it('giá trị hợp lệ được hiện lại đã chuẩn hóa; không hợp lệ thì giữ nguyên cái đã gõ', () => {
    expect(normalizeForDisplay('phone', '+84 912 345 678')).toBe('0912345678');
    expect(normalizeForDisplay('phone', '12 34')).toBe('12 34');
    expect(normalizeForDisplay('name', '  Nguyễn   Văn A ')).toBe('Nguyễn Văn A');
  });
});

describe('makeIdempotencyKey', () => {
  it('là UUID v4 hợp lệ, khác nhau mỗi lần, và không phụ thuộc crypto.randomUUID', () => {
    const original = crypto.randomUUID;
    // Mô phỏng HTTP thường (không phải ngữ cảnh an toàn): randomUUID không tồn tại.
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
    try {
      const keys = new Set(Array.from({ length: 50 }, makeIdempotencyKey));
      expect(keys.size).toBe(50);
      for (const key of keys) {
        expect(key).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        );
      }
    } finally {
      Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true });
    }
  });
});
