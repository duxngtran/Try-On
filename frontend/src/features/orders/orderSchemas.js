import { z } from 'zod';

// Bộ quy tắc này được chép từ backend/src/validation/orderSchemas.js (D-21). Sửa một nơi thì sửa nơi kia và
// bảng case ở cả hai test (backend/tests/orderSchemas.test.js, orderSchemas.test.js ở đây).

export const RECIPIENT_NAME_MIN = 2;
export const RECIPIENT_NAME_MAX = 100;
export const ADDRESS_MIN = 10;
export const ADDRESS_MAX = 300;

export const ORDER_MESSAGES = {
  name: 'Vui lòng nhập họ tên người nhận (2–100 ký tự).',
  phone: 'Số điện thoại không hợp lệ.',
  address: 'Vui lòng nhập địa chỉ đầy đủ (10–300 ký tự).',
};

// Ký tự điều khiển (Cc). Tab, xuống dòng đã được gộp thành dấu cách trước bước kiểm này.
const CONTROL_CHARS = /\p{Cc}/u;
// Chỉ di động Việt Nam (US-08 mục 6). Máy bàn, số nước ngoài không qua được.
const VN_MOBILE = /^0[35789][0-9]{8}$/;
// Đếm theo code point như char_length của Postgres, để ranh giới khớp với CHECK ở DB.
const codePointLength = (value) => [...value].length;

/** NFC, gộp mọi khoảng trắng và xuống dòng thành một dấu cách, bỏ khoảng trắng đầu cuối. */
export const normalizeText = (value) => value.normalize('NFC').replace(/\s+/g, ' ').trim();

/** Bỏ khoảng trắng, `.`, `-`, `(`, `)`; `+84` hoặc `84` ở đầu thành `0`. Không đoán thêm. */
export const normalizePhone = (value) =>
  value
    .normalize('NFC')
    .replace(/[\s.\-()]/g, '')
    .replace(/^\+?84/, '0');

const textSchema = (message, min, max) =>
  z
    .string({ error: message })
    .transform(normalizeText)
    .pipe(
      z.string().refine((v) => {
        const length = codePointLength(v);
        return length >= min && length <= max && !CONTROL_CHARS.test(v);
      }, message),
    );

export const recipientSchema = z.object({
  name: textSchema(ORDER_MESSAGES.name, RECIPIENT_NAME_MIN, RECIPIENT_NAME_MAX),
  phone: z
    .string({ error: ORDER_MESSAGES.phone })
    .transform(normalizePhone)
    .pipe(z.string().regex(VN_MOBILE, ORDER_MESSAGES.phone)),
  address: textSchema(ORDER_MESSAGES.address, ADDRESS_MIN, ADDRESS_MAX),
});

/**
 * Kiểm và chuẩn hóa ba ô nhận hàng.
 * @returns {{ ok: true, recipient: { name: string, phone: string, address: string } }
 *   | { ok: false, errors: Partial<Record<'name' | 'phone' | 'address', string>> }}
 */
export function validateRecipient(values) {
  const result = recipientSchema.safeParse(values);
  if (result.success) return { ok: true, recipient: result.data };
  const errors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (!(field in errors)) errors[field] = ORDER_MESSAGES[field];
  }
  return { ok: false, errors };
}

/** Giá trị hiển thị lại khi rời ô: chuẩn hóa nếu hợp lệ, giữ nguyên nếu không (để người dùng thấy cái đã gõ). */
export function normalizeForDisplay(field, value) {
  const result = recipientSchema.shape[field].safeParse(value);
  return result.success ? result.data : value;
}
