import { z } from 'zod';

// Bộ quy tắc này được chép sang frontend (D-21). Sửa một nơi thì sửa nơi kia và bảng case ở cả hai test.

export const RECIPIENT_NAME_MIN = 2;
export const RECIPIENT_NAME_MAX = 100;
export const ADDRESS_MIN = 10;
export const ADDRESS_MAX = 300;
export const ORDERS_PAGE_LIMIT_DEFAULT = 20;
export const ORDERS_PAGE_LIMIT_MAX = 50;

export const ORDER_MESSAGES = {
  name: 'Vui lòng nhập họ tên người nhận (2–100 ký tự).',
  phone: 'Số điện thoại không hợp lệ.',
  address: 'Vui lòng nhập địa chỉ đầy đủ (10–300 ký tự).',
  idempotencyKey: 'Khóa đặt hàng không hợp lệ.',
  cartFingerprint: 'Mã giỏ hàng không hợp lệ.',
  recipient: 'Thiếu thông tin nhận hàng.',
  quantity: 'Số lượng không hợp lệ.',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FINGERPRINT = /^[0-9a-f]{32}$/i;
// Ký tự điều khiển (Cc). Tab, xuống dòng đã được gộp thành dấu cách trước bước kiểm này.
const CONTROL_CHARS = /\p{Cc}/u;
// Chỉ di động Việt Nam (US-08 mục 6): 03x, 05x, 07x, 08x, 09x. Máy bàn, số nước ngoài không qua được.
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

export const recipientNameSchema = textSchema(
  ORDER_MESSAGES.name,
  RECIPIENT_NAME_MIN,
  RECIPIENT_NAME_MAX,
);
export const addressSchema = textSchema(ORDER_MESSAGES.address, ADDRESS_MIN, ADDRESS_MAX);
export const phoneSchema = z
  .string({ error: ORDER_MESSAGES.phone })
  .transform(normalizePhone)
  .pipe(z.string().regex(VN_MOBILE, ORDER_MESSAGES.phone));

/**
 * Body của `POST /orders`. Giá, tổng tiền, tên và dòng hàng từ client không có trong schema nên bị bỏ (AC-04).
 * `cartFingerprint` đưa về chữ thường vì md5 của Postgres là chữ thường và DB so sánh từng ký tự.
 */
export const placeOrderBodySchema = z.object({
  idempotencyKey: z
    .string({ error: ORDER_MESSAGES.idempotencyKey })
    .regex(UUID, ORDER_MESSAGES.idempotencyKey),
  cartFingerprint: z
    .string({ error: ORDER_MESSAGES.cartFingerprint })
    .regex(FINGERPRINT, ORDER_MESSAGES.cartFingerprint)
    .transform((v) => v.toLowerCase()),
  recipient: z.object(
    { name: recipientNameSchema, phone: phoneSchema, address: addressSchema },
    { error: ORDER_MESSAGES.recipient },
  ),
});

const positiveIntString = (message) =>
  z
    .string({ error: message })
    .regex(/^[0-9]{1,9}$/, message)
    .transform(Number);

/** Query `GET /orders`: page >= 1, limit 1..50. */
export const listOrdersQuerySchema = z.object({
  page: positiveIntString('Trang không hợp lệ.')
    .pipe(z.number().min(1, 'Trang không hợp lệ.'))
    .default(1),
  limit: positiveIntString('Số dòng mỗi trang phải từ 1 đến 50.')
    .pipe(
      z
        .number()
        .min(1, 'Số dòng mỗi trang phải từ 1 đến 50.')
        .max(ORDERS_PAGE_LIMIT_MAX, 'Số dòng mỗi trang phải từ 1 đến 50.'),
    )
    .default(ORDERS_PAGE_LIMIT_DEFAULT),
});
