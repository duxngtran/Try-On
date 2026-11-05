import { z } from 'zod';
import { normalizeCategoryName } from './categorySchemas.js';

// Bộ quy tắc này được chép sang frontend (D-21). Sửa một nơi thì sửa nơi kia và bảng case ở cả hai test.

export const PRODUCT_NAME_MIN = 2;
export const PRODUCT_NAME_MAX = 120;
export const PRICE_MIN = 1000;
export const PRICE_MAX = 100_000_000;
export const PAGE_LIMIT_DEFAULT = 20;
export const PAGE_LIMIT_MAX = 100;

export const PRODUCT_MESSAGES = {
  name: 'Tên sản phẩm phải từ 2 đến 120 ký tự.',
  price: 'Giá phải là số nguyên từ 1.000 đến 100.000.000 đồng.',
  category: 'Vui lòng chọn danh mục.',
  noChange: 'Chưa có thay đổi nào để lưu.',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTROL_CHARS = /\p{Cc}/u;
// Đếm theo code point như char_length của Postgres, để ranh giới khớp với CHECK ở DB.
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

/**
 * Giá gửi dạng chuỗi chữ số thuần (multipart không có kiểu số). `199.5`, `-1000`, `abc`, ` 1000`
 * đều bị loại bởi regex; chuỗi quá dài thành Infinity/số lớn nên rơi ra ngoài khoảng.
 */
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

export const categoryIdSchema = z
  .string({ error: PRODUCT_MESSAGES.category })
  .regex(UUID, PRODUCT_MESSAGES.category);

/** Field chữ của `POST /admin/products`; field thừa bị bỏ. */
export const createProductBodySchema = z.object({
  name: productNameSchema,
  priceVnd: priceVndSchema,
  categoryId: categoryIdSchema,
});

/**
 * Field chữ của `PATCH /admin/products/:id`: tất cả tùy chọn, có mặt thì phải hợp lệ
 * (`name=""` là lỗi, không phải "giữ nguyên"). Kiểm "có ít nhất một thay đổi" xét cả file nên làm ở service.
 */
export const updateProductBodySchema = createProductBodySchema.partial();

const positiveIntString = (message) =>
  z
    .string({ error: message })
    .regex(/^[0-9]{1,9}$/, message)
    .transform(Number);

/** Query `GET /admin/products`: page >= 1, limit 1..100, categoryId UUID tùy chọn. */
export const listProductsQuerySchema = z.object({
  page: positiveIntString('Trang không hợp lệ.')
    .pipe(z.number().min(1, 'Trang không hợp lệ.'))
    .default(1),
  limit: positiveIntString('Số dòng mỗi trang phải từ 1 đến 100.')
    .pipe(
      z
        .number()
        .min(1, 'Số dòng mỗi trang phải từ 1 đến 100.')
        .max(PAGE_LIMIT_MAX, 'Số dòng mỗi trang phải từ 1 đến 100.'),
    )
    .default(PAGE_LIMIT_DEFAULT),
  categoryId: z.string().regex(UUID, 'Danh mục không hợp lệ.').optional(),
});
