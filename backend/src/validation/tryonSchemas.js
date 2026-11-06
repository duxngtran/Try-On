import { z } from 'zod';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Giữ nguyên chuỗi created_at của Postgres (micro giây), ví dụ `2026-11-06 02:00:00.893014+00`.
// Kiểm định dạng ở đây, vì chuỗi sai sẽ làm Postgres báo 22007 và API thành 500.
const PG_TIMESTAMP = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)$/;

export const TRYON_MESSAGES = Object.freeze({
  consentRequired: 'Bạn cần đồng ý để tiếp tục.',
  purpose: 'Mục đích không hợp lệ.',
  limit: 'Số lượng phải là số nguyên từ 1 đến 50.',
  cursor: 'Con trỏ không hợp lệ.',
  onePosition: 'Chỉ được dùng một trong after, before, at.',
  uuid: 'Mã sản phẩm không hợp lệ.',
});

/** Con trỏ là base64url của `{ c: created_at_raw, i: id }`. Client không tự dựng. */
export const encodeCursor = ({ createdAtRaw, id }) =>
  Buffer.from(JSON.stringify({ c: createdAtRaw, i: id }), 'utf8').toString('base64url');

/** @returns {{ createdAt: string, id: string } | null} null nếu không giải mã hoặc sai định dạng. */
export function decodeCursor(value) {
  if (typeof value !== 'string' || value.length > 200 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (typeof parsed?.c !== 'string' || typeof parsed?.i !== 'string') return null;
    if (!PG_TIMESTAMP.test(parsed.c) || !UUID.test(parsed.i)) return null;
    return { createdAt: parsed.c, id: parsed.i };
  } catch {
    return null;
  }
}

/** `accepted` phải đúng là `true`; trường thừa bị bỏ (D-93). */
export const consentBodySchema = z.object({
  accepted: z.literal(true, { error: TRYON_MESSAGES.consentRequired }),
});

/** `purpose` mặc định `display`. Client không gửi userId, version hay URL ảnh: trường thừa bị bỏ. */
export const createJobBodySchema = z.object({
  purpose: z.enum(['display', 'prefetch'], { error: TRYON_MESSAGES.purpose }).default('display'),
});

const cursorParam = z
  .string({ error: TRYON_MESSAGES.cursor })
  .refine((v) => decodeCursor(v) !== null, { error: TRYON_MESSAGES.cursor });

export const listProductsQuerySchema = z
  .object({
    limit: z.coerce
      .number({ error: TRYON_MESSAGES.limit })
      .int({ error: TRYON_MESSAGES.limit })
      .min(1, { error: TRYON_MESSAGES.limit })
      .max(50, { error: TRYON_MESSAGES.limit })
      .default(20),
    after: cursorParam.optional(),
    before: cursorParam.optional(),
    at: z
      .string({ error: TRYON_MESSAGES.uuid })
      .regex(UUID, { error: TRYON_MESSAGES.uuid })
      .optional(),
  })
  .refine((q) => [q.after, q.before, q.at].filter((v) => v !== undefined).length <= 1, {
    error: TRYON_MESSAGES.onePosition,
    path: ['after'],
  });
