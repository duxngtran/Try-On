import { describe, it, expect } from 'vitest';
import { placeOrderBodySchema } from '../src/validation/orderSchemas.js';

// Bảng case này được chép nguyên sang frontend/src/features/checkout/orderSchemas.test.js (D-21).
// Sửa một nơi thì sửa nơi kia. Mỗi dòng: [trường, đầu vào, kết quả chuẩn hóa hoặc null nếu phải bị từ chối].
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

const base = {
  idempotencyKey: '3b241101-e2bb-4255-8caf-4136c566a962',
  cartFingerprint: 'a'.repeat(32),
  recipient: { name: 'Nguyễn Văn A', phone: '0912345678', address: '12 Lê Lợi, Quận 1' },
};

describe('placeOrderBodySchema: bảng case dùng chung với frontend', () => {
  it.each(CASES)('%s %j -> %j', (field, input, expected) => {
    const result = placeOrderBodySchema.safeParse({
      ...base,
      recipient: { ...base.recipient, [field]: input },
    });
    if (expected === null) {
      expect(result.success).toBe(false);
      expect(result.error.issues.map((i) => i.path.join('.'))).toEqual([`recipient.${field}`]);
    } else {
      expect(result.success).toBe(true);
      expect(result.data.recipient[field]).toBe(expected);
    }
  });

  it('trường thừa (tổng tiền, dòng hàng) bị bỏ, không gây lỗi', () => {
    const result = placeOrderBodySchema.parse({
      ...base,
      totalVnd: 1,
      items: [{ priceVnd: 1 }],
      recipient: { ...base.recipient, extra: 'x' },
    });
    expect(Object.keys(result).sort()).toEqual(['cartFingerprint', 'idempotencyKey', 'recipient']);
    expect(Object.keys(result.recipient).sort()).toEqual(['address', 'name', 'phone']);
  });
});
