import { z } from 'zod';

// Bộ quy tắc này chép từ backend/src/validation/categorySchemas.js (D-21). Sửa một nơi thì sửa nơi kia
// và bảng case ở cả hai test.

export const CATEGORY_NAME_MIN = 2;
export const CATEGORY_NAME_MAX = 50;

export const CATEGORY_MESSAGES = {
  required: 'Vui lòng nhập tên danh mục.',
  length: 'Tên danh mục phải từ 2 đến 50 ký tự.',
  invalid: 'Tên danh mục không hợp lệ.',
  exists: 'Danh mục này đã tồn tại.',
};

const CONTROL_CHARS = /\p{Cc}/u;

/** NFC, gộp mọi khoảng trắng liên tiếp thành một dấu cách, bỏ khoảng trắng đầu cuối. */
export const normalizeCategoryName = (value) => value.normalize('NFC').replace(/\s+/g, ' ').trim();

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

export const categoryBodySchema = z.object({ name: categoryNameSchema });

/** Trùng không phân biệt hoa thường, có phân biệt dấu (giống unique `lower(name)` ở DB). */
export const sameCategoryName = (a, b) => a.toLowerCase() === b.toLowerCase();

/**
 * Kiểm tra tên ở form (phản hồi nhanh; backend vẫn là nơi quyết định).
 * @param {string} raw
 * @param {{ names?: string[] }} [options] `names`: tên các danh mục khác đang hiển thị (bỏ chính danh mục đang sửa).
 * @returns {{ name: string } | { error: string }} tên đã chuẩn hóa, hoặc lỗi đầu tiên.
 */
export function validateCategoryName(raw, { names = [] } = {}) {
  const parsed = categoryBodySchema.safeParse({ name: raw });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { name } = parsed.data;
  if (names.some((other) => sameCategoryName(other, name))) {
    return { error: CATEGORY_MESSAGES.exists };
  }
  return { name };
}
