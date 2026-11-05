import { z } from 'zod';
import { normalizeCategoryName } from './categorySchemas.js';

// Bộ quy tắc này chép từ backend/src/validation/productSchemas.js (D-21). Sửa một nơi thì sửa nơi kia
// và bảng case ở cả hai test.

export const PRODUCT_NAME_MIN = 2;
export const PRODUCT_NAME_MAX = 120;
export const PRICE_MIN = 1000;
export const PRICE_MAX = 100_000_000;

export const PRODUCT_MESSAGES = {
  name: 'Tên sản phẩm phải từ 2 đến 120 ký tự.',
  price: 'Giá phải là số nguyên từ 1.000 đến 100.000.000 đồng.',
  category: 'Vui lòng chọn danh mục.',
  noChange: 'Chưa có thay đổi nào để lưu.',
};

const CONTROL_CHARS = /\p{Cc}/u;
const codePointLength = (value) => [...value].length;

export const productNameSchema = z
  .string({ error: PRODUCT_MESSAGES.name })
  .transform(normalizeCategoryName)
  .pipe(
    z.string().refine((v) => {
      const length = codePointLength(v);
      return length >= PRODUCT_NAME_MIN && length <= PRODUCT_NAME_MAX && !CONTROL_CHARS.test(v);
    }, PRODUCT_MESSAGES.name),
  );

/** Giá gửi lên API: chuỗi chữ số thuần (giống backend). */
export const priceVndSchema = z
  .string({ error: PRODUCT_MESSAGES.price })
  .regex(/^[0-9]+$/, PRODUCT_MESSAGES.price)
  .transform(Number)
  .pipe(
    z
      .number()
      .int(PRODUCT_MESSAGES.price)
      .min(PRICE_MIN, PRODUCT_MESSAGES.price)
      .max(PRICE_MAX, PRODUCT_MESSAGES.price),
  );

// Số thuần, hoặc nhóm nghìn đúng 3 chữ số với MỘT loại dấu ngăn cách (chấm, phẩy hoặc khoảng trắng).
const PLAIN_DIGITS = /^[0-9]+$/;
const GROUPED = /^[0-9]{1,3}(?:([.,\s])[0-9]{3})+$/;

/**
 * Đọc giá người nhập (screens/product-form.md): `199000`, `199.000`, `199,000`, `199 000`.
 * `199.5`, `1.99`, `1,5`, `1.000,000` là lỗi, không tự diễn giải.
 * @param {string} raw
 * @returns {{ value: number } | { error: string }}
 */
export function parsePriceInput(raw) {
  const text = String(raw ?? '').trim();
  let digits = null;
  if (PLAIN_DIGITS.test(text)) {
    digits = text;
  } else {
    const match = GROUPED.exec(text);
    if (match) {
      // Các dấu ngăn cách phải giống nhau: `1.000,000` là lỗi.
      const separators = new Set(text.replace(/[0-9]/g, '').split(''));
      if (separators.size === 1) digits = text.replace(/[^0-9]/g, '');
    }
  }
  if (digits === null) return { error: PRODUCT_MESSAGES.price };
  const parsed = priceVndSchema.safeParse(digits);
  return parsed.success ? { value: parsed.data } : { error: PRODUCT_MESSAGES.price };
}

const vnNumber = new Intl.NumberFormat('vi-VN');
/** 199000 -> "199.000" (dùng cho ô nhập) */
export const formatPriceInput = (value) => vnNumber.format(value);
/** 199000 -> "199.000 ₫" (dùng để hiển thị) */
export const formatPriceVnd = (value) => `${vnNumber.format(value)} ₫`;

/**
 * Kiểm tra các ô của form. `values`: `{ name, price, categoryId }` (chuỗi người nhập).
 * @returns {{ errors: { name?: string, price?: string, categoryId?: string }, data: { name?: string, priceVnd?: number, categoryId?: string } }}
 */
export function validateProductFields({ name, price, categoryId }) {
  const errors = {};
  const data = {};
  const nameResult = productNameSchema.safeParse(name);
  if (nameResult.success) data.name = nameResult.data;
  else errors.name = PRODUCT_MESSAGES.name;

  const priceResult = parsePriceInput(price);
  if ('value' in priceResult) data.priceVnd = priceResult.value;
  else errors.price = priceResult.error;

  if (categoryId) data.categoryId = categoryId;
  else errors.categoryId = PRODUCT_MESSAGES.category;
  return { errors, data };
}

/** Chuẩn hóa URL của danh sách (D-61): `page` không phải số nguyên >= 1 thì là 1; `categoryId` không phải UUID thì bỏ. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function normalizeListParams(searchParams) {
  const rawPage = searchParams.get('page') ?? '';
  const page = /^[0-9]{1,9}$/.test(rawPage) && Number(rawPage) >= 1 ? Number(rawPage) : 1;
  const rawCategory = searchParams.get('categoryId') ?? '';
  return { page, categoryId: UUID.test(rawCategory) ? rawCategory : null };
}

/** Ngược lại: giá trị mặc định thì bỏ khỏi URL. */
export function buildListSearch({ page, categoryId }) {
  const params = new URLSearchParams();
  if (categoryId) params.set('categoryId', categoryId);
  if (page > 1) params.set('page', String(page));
  const text = params.toString();
  return text ? `?${text}` : '';
}
