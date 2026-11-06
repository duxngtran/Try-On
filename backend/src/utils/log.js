/**
 * Ghi log theo mã sự kiện + metadata nhỏ. Logger có thể chỉ có `error` (test), nên mọi mức gọi kiểu tùy chọn.
 * Người gọi chịu trách nhiệm không đưa ảnh, base64, signed URL, đường dẫn, số đo, API key vào `meta` (AC-20).
 * @param {Partial<Record<'info' | 'warn' | 'error', (...args: unknown[]) => void>>} logger
 * @param {'info' | 'warn' | 'error'} level
 * @param {string} event
 * @param {Record<string, string | number | boolean | null | undefined>} [meta]
 */
export function log(logger, level, event, meta) {
  try {
    logger?.[level]?.call(logger, event, meta);
  } catch {
    // Log hỏng không được làm hỏng nghiệp vụ.
  }
}
