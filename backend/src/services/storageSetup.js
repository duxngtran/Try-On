const MB = 1024 * 1024;

/**
 * Cấu hình bucket: chỉ JPEG (backend luôn xuất JPEG), giới hạn dung lượng.
 * Ảnh hồ sơ private (D-03, D-26); ảnh sản phẩm public chỉ đọc (D-46).
 */
export function buildBucketOptions({ maxMb, public: isPublic = false }) {
  return { public: isPublic, fileSizeLimit: maxMb * MB, allowedMimeTypes: ['image/jpeg'] };
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
 * @param {{ name: string, maxMb: number, public?: boolean }} config
 * @returns {Promise<'created' | 'updated' | 'unchanged'>}
 */
export async function ensureBucket(client, { name, maxMb, public: isPublic = false }) {
  const options = buildBucketOptions({ maxMb, public: isPublic });
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

/** Bucket ảnh hồ sơ: luôn private. */
export const ensureProfilePhotoBucket = (client, { name, maxMb }) =>
  ensureBucket(client, { name, maxMb, public: false });

/** Bucket ảnh sản phẩm: luôn public (D-46). */
export const ensureProductImageBucket = (client, { name, maxMb }) =>
  ensureBucket(client, { name, maxMb, public: true });

/** Bucket ảnh try-on (ảnh thân thể người dùng, D-78): luôn private. */
export const ensureTryonImageBucket = (client, { name, maxMb }) =>
  ensureBucket(client, { name, maxMb, public: false });
