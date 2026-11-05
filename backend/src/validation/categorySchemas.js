import { z } from 'zod';

// Bộ quy tắc này được chép sang frontend (D-21). Sửa một nơi thì sửa nơi kia và bảng case ở cả hai test.

export const CATEGORY_NAME_MIN = 2;
export const CATEGORY_NAME_MAX = 50;

export const CATEGORY_MESSAGES = {
  required: 'Vui lòng nhập tên danh mục.',
  length: 'Tên danh mục phải từ 2 đến 50 ký tự.',
  invalid: 'Tên danh mục không hợp lệ.',
  exists: 'Danh mục này đã tồn tại.',
};

// Ký tự điều khiển (Cc). Các khoảng trắng (tab, xuống dòng) đã được gộp thành dấu cách trước bước này.
const CONTROL_CHARS = /\p{Cc}/u;

/** NFC, gộp mọi khoảng trắng liên tiếp thành một dấu cách, bỏ khoảng trắng đầu cuối. */
export const normalizeCategoryName = (value) => value.normalize('NFC').replace(/\s+/g, ' ').trim();

// Đếm theo code point như char_length của Postgres, để ranh giới 50 khớp với CHECK ở DB.
const codePointLength = (value) => [...value].length;

export const categoryNameSchema = z
  .string({ error: CATEGORY_MESSAGES.required })
  .transform(normalizeCategoryName)
  .pipe(
    z
      .string()
      .min(1, CATEGORY_MESSAGES.required)
      .refine((v) => {
        const length = codePointLength(v);
        return length === 0 || (length >= CATEGORY_NAME_MIN && length <= CATEGORY_NAME_MAX);
      }, CATEGORY_MESSAGES.length)
      .refine((v) => !CONTROL_CHARS.test(v), CATEGORY_MESSAGES.invalid),
  );

/** Body của POST/PATCH danh mục; trường thừa bị bỏ. */
export const categoryBodySchema = z.object({ name: categoryNameSchema });
