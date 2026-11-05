const MB = 1024 * 1024;

/** Cấu hình bucket ảnh hồ sơ (D-03, D-26): private, chỉ JPEG (backend luôn xuất JPEG), giới hạn dung lượng. */
export function buildBucketOptions({ maxMb }) {
  return { public: false, fileSizeLimit: maxMb * MB, allowedMimeTypes: ['image/jpeg'] };
}

const isNotFound = (error) =>
  error?.statusCode === '404' ||
  error?.statusCode === 404 ||
  /not.?found/i.test(error?.message ?? '');

/** Cấu hình hiện có đã khớp mong muốn chưa (so sánh `public`, giới hạn, MIME). */
function matches(bucket, options) {
  const mimes = bucket.allowed_mime_types ?? [];
  return (
    bucket.public === options.public &&
    Number(bucket.file_size_limit) === options.fileSizeLimit &&
    mimes.length === options.allowedMimeTypes.length &&
    options.allowedMimeTypes.every((m) => mimes.includes(m))
  );
}

/**
 * Tạo bucket nếu chưa có, hoặc chỉnh lại nếu cấu hình lệch (idempotent).
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {{ name: string, maxMb: number }} config
 * @returns {Promise<'created' | 'updated' | 'unchanged'>}
 */
export async function ensureProfilePhotoBucket(client, { name, maxMb }) {
  const options = buildBucketOptions({ maxMb });
  const { data, error } = await client.storage.getBucket(name);
  if (error && !isNotFound(error)) throw error;

  if (!data) {
    const created = await client.storage.createBucket(name, options);
    if (created.error) throw created.error;
    return 'created';
  }
  if (matches(data, options)) return 'unchanged';
  const updated = await client.storage.updateBucket(name, options);
  if (updated.error) throw updated.error;
  return 'updated';
}
